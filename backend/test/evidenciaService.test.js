import { test } from "node:test";
import assert from "node:assert/strict";
import { analizarEnlace, armarCentroEvidencias, enlacesUnicos, situacionEvidencia } from "../src/services/evidenciaService.js";

test("reconoce enlaces de Drive y extrae el identificador", () => {
  const a = analizarEnlace("https://drive.google.com/file/d/1AbC_dEf-123/view?usp=sharing");
  assert.deepEqual([a.tipo_enlace, a.drive_id, a.clave], ["drive_archivo", "1AbC_dEf-123", "drive:1AbC_dEf-123"]);
  const c = analizarEnlace("https://drive.google.com/drive/u/0/folders/1CarpetaXYZ?usp=drive_link");
  assert.deepEqual([c.tipo_enlace, c.drive_id], ["drive_carpeta", "1CarpetaXYZ"]);
  const o = analizarEnlace("https://drive.google.com/open?id=1ArchivoABC");
  assert.deepEqual([o.tipo_enlace, o.drive_id], ["drive_archivo", "1ArchivoABC"]);
  const d = analizarEnlace("https://docs.google.com/document/d/1DocumentoQQ/edit");
  assert.deepEqual([d.tipo_enlace, d.drive_id], ["google_doc", "1DocumentoQQ"]);
  const f = analizarEnlace("https://docs.google.com/forms/d/e/1FAIpQLSabc/viewform");
  assert.deepEqual([f.tipo_enlace, f.drive_id], ["formulario", null]);
  assert.equal(analizarEnlace("https://forms.gle/abc123").tipo_enlace, "formulario");
  assert.equal(analizarEnlace("https://ejemplo.edu.co/informe.pdf").tipo_enlace, "otro");
});

test("la misma evidencia escrita de formas distintas produce la misma clave", () => {
  const claves = [
    "https://drive.google.com/file/d/1AbC_dEf-123/view",
    "https://drive.google.com/file/d/1AbC_dEf-123/view?usp=sharing",
    "https://drive.google.com/open?id=1AbC_dEf-123",
  ].map((u) => analizarEnlace(u).clave);
  assert.equal(new Set(claves).size, 1);
  assert.equal(analizarEnlace("https://Ejemplo.edu.co/a/b/").clave, analizarEnlace("https://ejemplo.edu.co/a/b").clave);
});

test("enlaces no http(s) o mal formados no se aceptan", () => {
  for (const malo of ["javascript:alert(1)", "ftp://x.test/a", "data:text/html,hola", "no es un enlace", "", null, undefined]) {
    assert.equal(analizarEnlace(malo), null, String(malo));
  }
  assert.deepEqual(enlacesUnicos(["javascript:alert(1)", "https://drive.google.com/file/d/1AbC_dEf-123/view", "https://drive.google.com/open?id=1AbC_dEf-123"]).length, 1);
});

test("situación de la evidencia según estado y requisito", () => {
  const base = { requiere_evidencia: true, evidencia_exenta: false };
  assert.equal(situacionEvidencia({ ...base, estado: "no_iniciado" }, []), "sin_evidencia");
  assert.equal(situacionEvidencia({ ...base, estado: "borrador" }, [{}]), "borrador");
  assert.equal(situacionEvidencia({ ...base, estado: "observado" }, [{}]), "observada");
  assert.equal(situacionEvidencia({ ...base, estado: "enviado" }, [{}]), "en_revision");
  assert.equal(situacionEvidencia({ ...base, estado: "aprobado" }, [{}]), "aprobada");
  assert.equal(situacionEvidencia({ requiere_evidencia: false, evidencia_exenta: false, estado: "no_iniciado" }, []), "sin_requisito");
  assert.equal(situacionEvidencia({ ...base, evidencia_exenta: true, estado: "borrador" }, []), "borrador");
});

test("el centro de evidencias separa vigentes y versiones anteriores y resume por situación", () => {
  const items = [
    { plantilla_id: 1, entregable_id: 10, estado: "observado", requiere_evidencia: true, vencido: true, entregable: "A", num_envios: 1 },
    { plantilla_id: 2, entregable_id: null, estado: "no_iniciado", requiere_evidencia: true, vencido: true, entregable: "B" },
    { plantilla_id: 3, entregable_id: 12, estado: "aprobado", requiere_evidencia: true, vencido: false, entregable: "C" },
  ];
  const mapa = new Map([[10, [{ id: 1, estado: "reemplazada", url: "u1" }, { id: 2, estado: "vigente", url: "u2" }]]]);
  const { items: out, resumen } = armarCentroEvidencias(items, mapa);
  assert.equal(out[0].evidencias.length, 1);
  assert.equal(out[0].versiones_anteriores.length, 1);
  assert.equal(out[0].puede_editar, true);
  assert.equal(out[2].puede_editar, false, "un entregable aprobado no se edita");
  assert.deepEqual([resumen.observada, resumen.sin_evidencia, resumen.aprobada, resumen.vencidos_sin_enviar], [1, 1, 1, 2]);
});

test("distingue Documentos, Hojas y Presentaciones de Google y detecta duplicados por identificador", () => {
  assert.equal(analizarEnlace("https://docs.google.com/document/d/1DocAAAAA/edit").tipo_enlace, "google_doc");
  assert.equal(analizarEnlace("https://docs.google.com/spreadsheets/d/1HojaBBBBB/edit#gid=0").tipo_enlace, "google_hoja");
  assert.equal(analizarEnlace("https://docs.google.com/presentation/d/1SlideCCCC/edit").tipo_enlace, "google_presentacion");
  assert.equal(analizarEnlace("https://docs.google.com/spreadsheets/d/1HojaBBBBB/edit#gid=0").clave, analizarEnlace("https://docs.google.com/spreadsheets/d/1HojaBBBBB/view").clave);
  // Enlaces externos permitidos por las plantillas: se aceptan como «otro»
  assert.equal(analizarEnlace("https://forms.office.com/r/abc123").tipo_enlace, "formulario");
  assert.equal(analizarEnlace("https://universidad.edu.co/repositorio/informe.pdf").tipo_enlace, "otro");
});
