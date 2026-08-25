import "dotenv/config";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { createSessionToken } from "../src/middleware/auth.js";

const port = 4199;
const api = `http://127.0.0.1:${port}`;
const marker = `CODEX_PHASE19_${Date.now()}`;
const created = {
  programId: null,
  teacherId: null,
  projectId: null,
  groupIds: [],
  templateIds: [],
};

let server;

async function apiRequest(path, token, options = {}) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${api}/health`);
      if (response.ok) return;
    } catch {
      // El proceso todavía está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw new Error("El backend de prueba no inició a tiempo");
}

async function setup() {
  const semesterResult = await pool.query(
    `SELECT codigo, fecha_inicio, fecha_fin, numero_semanas
     FROM semestres ORDER BY fecha_inicio DESC LIMIT 1`
  );
  assert.equal(semesterResult.rowCount, 1, "Se requiere al menos un semestre");
  const semester = semesterResult.rows[0];

  const program = await pool.query(
    `INSERT INTO programas (nombre, codigo) VALUES ($1, $2) RETURNING id`,
    [`Programa ${marker}`, marker.slice(-30)]
  );
  created.programId = Number(program.rows[0].id);

  for (const suffix of ["A", "B"]) {
    const group = await pool.query(
      `
      INSERT INTO grupos_matriz (
        nombre, descripcion, tipo_docente, horas_totales,
        num_proyectos, num_actividades, num_convenios_nuevos,
        num_convenios_dinamizados, activo, semestre
      )
      VALUES ($1, 'Prueba automatizada temporal', 'ANTIGUO', 1, 1, 0, 0, 0, true, $2)
      RETURNING id
      `,
      [`${marker}_${suffix}`, semester.codigo]
    );
    created.groupIds.push(Number(group.rows[0].id));
  }

  const teacher = await pool.query(
    `
    INSERT INTO usuarios (
      nombre, apellido, correo, rol, programa_id, estado,
      tipo_docente, grupo_matriz_id
    )
    VALUES ('Prueba', 'Fase19', $1, 'docente', $2, 'activo', 'ANTIGUO', $3)
    RETURNING id, nombre, apellido, correo, rol
    `,
    [`${marker.toLowerCase()}@cun.edu.co`, created.programId, created.groupIds[0]]
  );
  created.teacherId = Number(teacher.rows[0].id);

  const project = await pool.query(
    `
    INSERT INTO proyectos (
      titulo, descripcion, programa_id, docente_responsable_id,
      tipo, estado, fecha_inicio, fecha_fin_estimada, horas_totales, semanas
    )
    VALUES ($1, 'Prueba automatizada temporal', $2, $3, 'proyecto',
            'en_ejecucion', $4, $5, 1, $6)
    RETURNING id
    `,
    [
      `Iniciativa ${marker}`,
      created.programId,
      created.teacherId,
      semester.fecha_inicio,
      semester.fecha_fin,
      Number(semester.numero_semanas),
    ]
  );
  created.projectId = Number(project.rows[0].id);

  await pool.query(
    `
    INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin)
    SELECT
      $1,
      n,
      ($2::date + ((n - 1) * 7))::date,
      LEAST(($2::date + ((n * 7) - 1))::date, $3::date)
    FROM generate_series(1, $4::int) n
    `,
    [
      created.projectId,
      semester.fecha_inicio,
      semester.fecha_fin,
      Number(semester.numero_semanas),
    ]
  );

  for (const groupId of created.groupIds) {
    const template = await pool.query(
      `
      INSERT INTO plantilla_entregables (
        grupo_id, numero, categoria, fase, mes, semana_numero,
        entregable, descripcion_evidencia, horas,
        dias_inicio_desde_feb, dias_fin_desde_feb
      )
      VALUES ($1, 99999, 'Proyecto', 'Prueba', 'prueba', 1,
              $2, 'Descripción anterior', 1, 0, 1)
      RETURNING id
      `,
      [groupId, `Entregable ${marker} Proyecto 1`]
    );
    created.templateIds.push(Number(template.rows[0].id));
  }

  const adminResult = await pool.query(
    `SELECT id, nombre, apellido, correo, rol
     FROM usuarios WHERE rol = 'admin' AND estado = 'activo' ORDER BY id LIMIT 1`
  );
  assert.equal(adminResult.rowCount, 1, "Se requiere un administrador activo");
  return {
    admin: adminResult.rows[0],
    teacher: teacher.rows[0],
  };
}

async function cleanup() {
  await pool.query(
    `DELETE FROM actualizaciones_masivas_entregables
     WHERE entregable_clave LIKE $1`,
    [`%${marker}%`]
  );
  if (created.projectId) {
    await pool.query(
      `
      DELETE FROM notificacion_correos correo
      WHERE EXISTS (
        SELECT 1
        FROM proyecto_entregables entregable
        INNER JOIN proyecto_semanas semana
          ON semana.id = entregable.proyecto_semana_id
        WHERE semana.proyecto_id = $1
          AND (
            correo.clave LIKE CONCAT('nuevo_reporte:', entregable.id, ':%')
            OR correo.clave LIKE CONCAT('observado:', entregable.id, ':%')
            OR correo.clave LIKE CONCAT('aprobado:', entregable.id, ':%')
          )
      )
      `,
      [created.projectId]
    );
    await pool.query(`DELETE FROM proyectos WHERE id = $1`, [created.projectId]);
  }
  if (created.teacherId) {
    await pool.query(`DELETE FROM usuarios WHERE id = $1`, [created.teacherId]);
  }
  if (created.groupIds.length) {
    await pool.query(`DELETE FROM grupos_matriz WHERE id = ANY($1::int[])`, [
      created.groupIds,
    ]);
  }
  if (created.programId) {
    await pool.query(`DELETE FROM programas WHERE id = $1`, [created.programId]);
  }
}

async function run() {
  const users = await setup();
  const adminToken = createSessionToken(users.admin);
  const teacherToken = createSessionToken(users.teacher);

  server = spawn(process.execPath, ["src/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port), EMAIL_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let serverError = "";
  server.stderr.on("data", (chunk) => {
    serverError += chunk.toString();
  });
  await waitForServer();

  const session = await apiRequest("/auth/me", adminToken);
  assert.equal(session.response.status, 200);
  assert.match(session.data.semestre.fecha_inicio, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(session.data.semestre.fecha_fin, /^\d{4}-\d{2}-\d{2}$/);

  const projectsList = await apiRequest("/admin/proyectos?page=1&limit=200", adminToken);
  assert.equal(projectsList.response.status, 200, JSON.stringify(projectsList.data));
  assert.ok(
    projectsList.data.proyectos.some((project) => project.id === created.projectId),
    "La iniciativa temporal debe aparecer en el listado administrativo"
  );

  const updateTeacherGroup = async (groupId) =>
    apiRequest(`/admin/usuarios/${created.teacherId}`, adminToken, {
      method: "PUT",
      body: JSON.stringify({
        nombre: "Prueba",
        apellido: "Fase19",
        correo: users.teacher.correo,
        rol: "docente",
        programa_id: created.programId,
        estado: "activo",
        tipo_docente: "ANTIGUO",
        regional: null,
        link_drive: null,
        grupo_matriz_id: groupId,
      }),
    });

  const changedGroup = await updateTeacherGroup(created.groupIds[1]);
  assert.equal(changedGroup.response.status, 200, JSON.stringify(changedGroup.data));
  assert.equal(Number(changedGroup.data.grupo_matriz_id), created.groupIds[1]);
  const changedGroupStored = await pool.query(
    "SELECT grupo_matriz_id FROM usuarios WHERE id = $1",
    [created.teacherId]
  );
  assert.equal(Number(changedGroupStored.rows[0].grupo_matriz_id), created.groupIds[1]);

  const restoredGroup = await updateTeacherGroup(created.groupIds[0]);
  assert.equal(restoredGroup.response.status, 200, JSON.stringify(restoredGroup.data));
  assert.equal(Number(restoredGroup.data.grupo_matriz_id), created.groupIds[0]);

  const matrix = await apiRequest(
    `/docente/${created.teacherId}/matriz`,
    teacherToken
  );
  assert.equal(matrix.response.status, 200);
  assert.equal(matrix.data.items.length, 1);
  assert.equal(matrix.data.items[0].iniciativa_id, created.projectId);
  assert.equal(matrix.data.items[0].iniciativa_titulo, `Iniciativa ${marker}`);

  const dashboard = await apiRequest(
    `/docente/${created.teacherId}/dashboard-stats`,
    teacherToken
  );
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.data.stats.total, 1);
  assert.equal(dashboard.data.activities.length, 1);
  assert.equal(dashboard.data.activities[0].initiative, `Iniciativa ${marker}`);

  const scheduleBeforeDraft = await apiRequest(
    `/docente/${created.teacherId}/cronograma`,
    teacherToken
  );
  assert.equal(scheduleBeforeDraft.response.status, 200);
  const scheduledProject = scheduleBeforeDraft.data.proyectos.find(
    (project) => project.id === created.projectId
  );
  assert.ok(scheduledProject, "La iniciativa debe estar disponible para reportar");
  const scheduledWeek = scheduledProject.weeks.find((week) => week.numero === 1);
  assert.match(scheduledWeek.fechaInicio, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(scheduledWeek.fechaFin, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(scheduledWeek.entregablesDetalle.length, 1);
  assert.equal(scheduledWeek.entregablesDetalle[0].id, null);
  assert.equal(
    Number(scheduledWeek.entregablesDetalle[0].plantillaId),
    created.templateIds[0]
  );

  const completion = await apiRequest(
    `/docente/${created.teacherId}/matriz/${created.templateIds[0]}/completar`,
    teacherToken,
    {
      method: "POST",
      body: JSON.stringify({ completado: false }),
    }
  );
  assert.equal(completion.response.status, 200, JSON.stringify(completion.data));
  assert.equal(completion.data.fecha_cargue_evidencia, null);

  const draft = await apiRequest(
    `/docente/entregables/${completion.data.entregable_id}/borrador`,
    teacherToken,
    {
      method: "PATCH",
      body: JSON.stringify({
        docente_id: created.teacherId,
        actividad_reportada: `Actividad ${marker}`,
        descripcion_reporte: "Borrador automatizado",
        porcentaje_avance: 75,
        urls_evidencia: ["https://drive.google.com/test"],
      }),
    }
  );
  assert.equal(draft.response.status, 200, JSON.stringify(draft.data));

  const submitted = await apiRequest(
    `/docente/entregables/${completion.data.entregable_id}`,
    teacherToken,
    {
      method: "PUT",
      body: JSON.stringify({
        docente_id: created.teacherId,
        completado: true,
        url_evidencia: "https://drive.google.com/test",
        actividad_reportada: `Actividad ${marker}`,
        descripcion_reporte: "Reporte automatizado",
        porcentaje_avance: 100,
      }),
    }
  );
  assert.equal(submitted.response.status, 200, JSON.stringify(submitted.data));

  const stored = await pool.query(
    `SELECT docente_id, fecha_real_entrega, fecha_cargue_evidencia
     FROM proyecto_entregables WHERE id = $1`,
    [completion.data.entregable_id]
  );
  assert.equal(Number(stored.rows[0].docente_id), created.teacherId);
  assert.ok(stored.rows[0].fecha_cargue_evidencia);

  const metricsBeforeReview = await apiRequest("/admin/metricas", adminToken);
  assert.equal(metricsBeforeReview.response.status, 200);
  const review = await apiRequest(
    `/admin/reportes-revision/${completion.data.entregable_id}`,
    adminToken,
    {
      method: "PUT",
      body: JSON.stringify({ estado_revision: "aprobado", comentario_revision: null }),
    }
  );
  assert.equal(review.response.status, 200, JSON.stringify(review.data));
  const metricsAfterReview = await apiRequest("/admin/metricas", adminToken);
  assert.equal(metricsAfterReview.response.status, 200);
  assert.equal(
    Number(metricsAfterReview.data.resumen.pendientes),
    Number(metricsBeforeReview.data.resumen.pendientes) - 1
  );
  assert.equal(
    Number(metricsAfterReview.data.resumen.aprobados),
    Number(metricsBeforeReview.data.resumen.aprobados) + 1
  );

  const forbiddenDate = await apiRequest(
    `/docente/entregables/${completion.data.entregable_id}/fecha-entrega`,
    teacherToken,
    {
      method: "PATCH",
      body: JSON.stringify({ fecha_real_entrega: "2000-01-01" }),
    }
  );
  assert.equal(forbiddenDate.response.status, 403);

  const stats = await apiRequest(
    `/docente/${created.teacherId}/matriz-stats`,
    teacherToken
  );
  assert.equal(stats.response.status, 200);
  assert.equal(stats.data.resumen.porcentaje_real, 100);
  assert.equal(typeof stats.data.resumen.porcentaje_esperado, "number");

  const exception = await apiRequest(
    `/admin/docentes/${created.teacherId}/plantillas/${created.templateIds[0]}/excepcion`,
    adminToken,
    {
      method: "PUT",
      body: JSON.stringify({
        entregable_override: `Entregable individual ${marker}`,
        descripcion_evidencia_override: "Evidencia individual",
        enlace_referencia_override: "https://forms.google.com/test",
        fecha_inicio_override: "2030-01-01",
        fecha_fin_override: "2030-01-31",
        proyecto_id: created.projectId,
        motivo: "Prueba automatizada temporal",
      }),
    }
  );
  assert.equal(exception.response.status, 200, JSON.stringify(exception.data));

  const adjusted = await apiRequest(
    `/admin/docentes/${created.teacherId}/matriz`,
    adminToken
  );
  assert.equal(adjusted.response.status, 200);
  assert.equal(adjusted.data.items[0].tiene_excepcion, true);
  assert.equal(adjusted.data.items[0].fecha_fin_calculada, "2030-01-31");

  const preview = await apiRequest(
    `/admin/plantillas/actualizacion-masiva/preview`,
    adminToken,
    {
      method: "POST",
      body: JSON.stringify({ plantilla_id: created.templateIds[0] }),
    }
  );
  assert.equal(preview.response.status, 200);
  assert.equal(preview.data.plantillas_afectadas, 2);
  assert.equal(preview.data.grupos_afectados, 2);

  const massive = await apiRequest(
    `/admin/plantillas/actualizacion-masiva`,
    adminToken,
    {
      method: "PUT",
      body: JSON.stringify({
        plantilla_id: created.templateIds[0],
        descripcion_evidencia: "Descripción masiva validada",
        enlace_referencia: "https://forms.google.com/masivo",
      }),
    }
  );
  assert.equal(massive.response.status, 200, JSON.stringify(massive.data));
  assert.equal(massive.data.plantillas_afectadas, 2);

  const updatedTemplates = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM plantilla_entregables
     WHERE id = ANY($1::int[])
       AND descripcion_evidencia = 'Descripción masiva validada'
       AND enlace_referencia = 'https://forms.google.com/masivo'`,
    [created.templateIds]
  );
  assert.equal(updatedTemplates.rows[0].total, 2);

  if (server.exitCode != null && server.exitCode !== 0) {
    throw new Error(serverError || `Backend finalizó con código ${server.exitCode}`);
  }

  console.log("Prueba de entregables operativos completada correctamente.");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server && server.exitCode == null) server.kill("SIGTERM");
    await cleanup().catch((error) => {
      console.error("No se pudo limpiar la prueba temporal", error);
      process.exitCode = 1;
    });
    await pool.end();
  });
