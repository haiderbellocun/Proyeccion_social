# Ajustes de la reunión del 29 de julio de 2026

Este documento deja formalizada la implementación acordada para las matrices de seguimiento de Proyección Social.

## Comportamiento implementado

1. **Avance real frente al esperado.** El dashboard docente, la matriz individual y el consolidado administrativo muestran ambos valores y su nivel de cumplimiento.
2. **Identificación de la iniciativa.** Cada entregable informa el proyecto, actividad o convenio relacionado. Los entregables transversales se identifican como gestión general o como aplicables a todas las iniciativas de un tipo.
3. **Nomenclatura unificada.** Las tareas del docente se presentan como **entregables**. Proyecto, actividad y convenio se conservan como tipos de iniciativa.
4. **Periodo exacto.** Se muestran la fecha de inicio y la fecha límite. El administrador edita fechas exactas; internamente la plantilla conserva los desplazamientos respecto al inicio del semestre para permitir su clonación.
5. **Excepciones por docente.** Desde la matriz administrativa se puede personalizar texto, evidencia requerida, enlace, fechas e iniciativa para un solo docente. La plantilla del grupo no cambia y el motivo queda registrado.
6. **Actualización masiva de evidencias.** Desde una plantilla se pueden actualizar instrucciones y enlaces compartidos. El alcance se previsualiza y se limita al mismo semestre y a nombres de entregable exactamente coincidentes.
7. **Fechas protegidas.** El navegador no envía ni edita la fecha real de entrega. El servidor registra `fecha_real_entrega` y `fecha_cargue_evidencia` al enviar o reenviar la evidencia. El endpoint antiguo de edición devuelve `403`.
8. **Vista cronológica.** El panel docente obtiene todos los entregables desde la plantilla del grupo, aunque todavía no exista un reporte, y los ordena por su periodo efectivo.
9. **Pertenencia individual del reporte.** `proyecto_entregables.docente_id` evita que la evidencia cargada por un docente se contabilice para otros docentes asignados a la misma iniciativa.

## Reglas de cálculo

- `avance_real = entregables_completados / total_entregables * 100`
- `avance_esperado = entregables_con_fecha_límite_hasta_hoy / total_entregables * 100`
- `cumplimiento_esperado = entregables_completados / entregables_exigibles_hasta_hoy * 100`
- `brecha = avance_real - avance_esperado`

El cumplimiento puede superar 100 % cuando el docente adelanta entregables futuros. Si todavía no hay entregables exigibles, el cumplimiento esperado se considera 100 %.

## Prioridad de configuración

Para cada docente y entregable, el sistema aplica esta precedencia:

1. Excepción individual registrada por el administrador.
2. Plantilla general del grupo matriz.

Para identificar la iniciativa se prioriza la iniciativa del reporte existente, luego la seleccionada en la excepción y finalmente la inferencia por tipo y ordinal presentes en el entregable (`Proyecto 1`, `Actividad 2`, etc.).

## Base de datos y verificación

La migración es `fase19_entregables_operativos.sql`. Es idempotente y se ejecuta con:

```bash
cd backend
npm run migrate
```

La prueba de integración crea datos temporales, valida los flujos y los elimina al terminar:

```bash
cd backend
npm run test:entregables
```

