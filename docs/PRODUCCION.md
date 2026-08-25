# Datos necesarios para producción

La base de datos es la única fuente de verdad. No hay mocks en el frontend.
Tras migrar el esquema, debes cargar **datos institucionales reales** antes de abrir el sistema a docentes.

## Modelo canónico (fase 19+)

```
semestres
  └── grupos_matriz          ← carga del docente (proyectos, actividades, convenios, horas)
        └── plantilla_entregables  ← checklist semanal
escuelas
  └── programas              ← cada programa pertenece a una escuela (escuela_id)
usuarios (admin | docente)
  ├── programa_id → programas
  └── grupo_matriz_id → grupos_matriz
proyectos (iniciativas)
  └── proyecto_semanas
        └── proyecto_entregables
              ├── plantilla_id → plantilla_entregables
              └── docente_id → usuarios
docente_entregable_excepciones → ajuste por docente + plantilla
```

Retirado del modelo: `perfiles_indicador`, `programa_perfil_indicador`, `catalogo_entregables`.

---

## Alcance del módulo administrativo

| Pestaña | Operaciones disponibles |
|---------|-------------------------|
| **Usuarios** | Crear, editar, activar/inactivar y eliminar; asignar rol, programa, tipo docente, regional, Drive y grupo matriz |
| **Semestres** | Crear, editar, activar y eliminar; consultar conteos relacionados |
| **Escuelas y programas** | CRUD completo de ambos catálogos |
| **Iniciativas** | Crear, editar y eliminar; administrar responsable, colaboradores, tipo, estado, fechas, horas y semanas |
| **Tareas semanales** | CRUD y clonación de grupos de matriz entre semestres |
| **Plantillas** | CRUD de entregables, fechas exactas, enlaces y actualización masiva por coincidencia dentro del semestre |
| **Matriz de un docente** | Crear, editar y restablecer excepciones individuales de texto, fechas, evidencia e iniciativa |

Reglas de seguridad de datos:

- Debe permanecer al menos un administrador activo y nadie puede eliminar o desactivar su propia cuenta administrativa.
- No se puede eliminar el semestre activo; primero se debe activar otro.
- Los cambios de cronograma con entregables y las eliminaciones con reportes solicitan una segunda confirmación.
- Al eliminar forzadamente una plantilla, los reportes históricos permanecen y su `plantilla_id` queda en `NULL`.
- Un docente solo se puede asignar a un grupo activo de su mismo tipo (`ANTIGUO` o `NUEVO`).
- La fecha real y la hora de cargue se generan en el servidor; el docente no puede editarlas.
- Una actualización masiva solo afecta el mismo semestre y entregables con nombre normalizado idéntico.

---

## Checklist de datos mínimos

### 1. Semestre activo (obligatorio)

| Campo | Ejemplo |
|-------|---------|
| `codigo` | `2026A` |
| `fecha_inicio` / `fecha_fin` | fechas reales del periodo |
| `numero_semanas` | 16 |
| `activo` | solo uno en `true` |

En UI: **Administración → Semestres**. La clonación de grupos desde un periodo previo está en **Tareas semanales**.

### 2. Escuelas y programas (obligatorio)

Las **escuelas** son una tabla propia (`escuelas`). Cada **programa** apunta a una escuela con `programas.escuela_id`.

Orden de carga:

1. Crear escuelas (nombre; código opcional)
2. Crear programas vinculados a una escuela (`codigo`, `nombre`, `escuela_id`)

En UI: **Administración → Escuelas y programas**.

Sin escuelas/programas, los filtros de usuarios, revisión e iniciativas quedan vacíos.

### 3. Grupos de matriz + plantillas (obligatorio para docentes)

Cada docente activo debe tener `grupo_matriz_id`.

- Los grupos 1–15 del semestre sembrado en migración son la matriz institucional base (puedes editarlos o clonarlos al nuevo semestre).
- Las plantillas definen qué marcar cada semana.
- Gestionar en **Tareas semanales** y **Plantillas**.

### 4. Usuarios (obligatorio)

| Rol | Qué cargar |
|-----|------------|
| **Admin** | Al menos 1 con `bootstrap-admin` o UI Usuarios |
| **Docentes** | Lista completa: nombre, apellido, **correo Google institucional**, programa, tipo (`ANTIGUO`/`NUEVO`), grupo de matriz |

El correo debe coincidir exactamente con la cuenta Google. El dominio debe estar en `ALLOWED_GOOGLE_DOMAINS` si lo usas (ej. `cun.edu.co`).

### 5. Iniciativas / proyectos (obligatorio para reportar)

Por cada docente (según su grupo):

- Crear las iniciativas (`proyecto`, `convenio`, `actividad`) con semanas del semestre.
- Asignar responsable / colaboradores.

Sin `proyecto_semanas` con el número de semana de la plantilla, el docente **no puede completar** ítems de la matriz (HTTP 422).

### 6. Configuración de despliegue (no es SQL)

| Variable | Dónde |
|----------|--------|
| `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` | Mismo client OAuth web |
| Orígenes JS autorizados | URL(s) de prod en Google Cloud |
| `JWT_SECRET` | Secreto largo, único por entorno |
| `ALLOWED_ORIGIN` | URL del frontend |
| `DATABASE_URL` o `PG*` | Postgres de prod / Cloud SQL |
| `ALLOWED_GOOGLE_DOMAINS` | Opcional, ej. `cun.edu.co` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_FROM` | Configuración pública del transporte de correos |
| `SMTP_PASS` | Contraseña SMTP inyectada desde Secret Manager |

---

## Orden recomendado de carga en prod

1. Migraciones (`npm run migrate` en `backend`)
2. Semestre activo
3. Escuelas y luego programas (`escuela_id`)
4. Grupos y plantillas (clonar semestre o cargar desde admin)
5. Bootstrap admin → login Google
6. Alta masiva de docentes + asignación de grupo
7. Creación de iniciativas por docente
8. Prueba E2E: docente marca matriz → admin revisa

## Qué NO debes cargar como “mock”

- Usuarios de prueba con correos inventados
- Programas inventados
- Reportes/evidencias de demostración en prod
- Catálogos antiguos de indicadores paralelos (ya no existen)

Los grupos/plantillas institucionales **sí** son datos maestros reales (matriz CUN), no demos de UI.
