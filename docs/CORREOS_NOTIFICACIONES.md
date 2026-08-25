# Correos de notificaciones

ProySocial mantiene dos canales sincronizados:

- La campana muestra notificaciones dentro de la aplicación.
- La bandeja `notificacion_correos` conserva los correos pendientes, enviados, fallidos o cancelados.

El correo no reemplaza la notificación interna. Un fallo SMTP no pierde el evento ni impide que el docente o administrador continúe trabajando.

## Eventos enviados

| Evento | Destinatario | Modalidad |
|---|---|---|
| Docente envía o reenvía un entregable | Administradores activos | Inmediata |
| Administrador aprueba un entregable | Docente autor del reporte | Inmediata |
| Administrador solicita ajustes | Docente autor del reporte | Inmediata, incluye comentario |
| Administrador envía un mensaje | Docente seleccionado | Inmediata |
| Entregables vencidos | Docente | Un resumen diario, nunca un correo por cada vencimiento |
| Docentes sin actividad durante 14 días | Administradores | Un resumen diario |

Cada evento usa una clave única. Reiniciar el backend o ejecutar varias veces el procesador no duplica correos.

## Configuración local

Completar en `backend/.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=cuenta-remitente@dominio.edu.co
SMTP_PASS=credencial-smtp-o-clave-de-aplicacion
SMTP_FROM="ProySocial <cuenta-remitente@dominio.edu.co>"
```

Estas son las únicas seis variables necesarias. El correo se activa automáticamente cuando la configuración está completa. Internamente se valida el certificado TLS, se procesan hasta 20 mensajes cada 60 segundos y se realizan hasta 5 intentos. Los enlaces usan `ALLOWED_ORIGIN` en local y la URL del servicio calculada por el despliegue.

Para Gmail o Google Workspace, `SMTP_PASS` debe ser una credencial SMTP admitida por la organización, normalmente una contraseña de aplicación. La contraseña de PostgreSQL, el Client ID OAuth y la cuenta de servicio de Cloud Run **no son credenciales SMTP**.

Después:

```bash
cd backend
npm run migrate
npm run test:correos
npm run dev
```

El estado público sin secretos se puede comprobar en `GET /health`:

```json
{
  "ok": true,
  "email": {
    "enabled": true,
    "configured": true
  }
}
```

Un administrador también puede consultar `GET /admin/correos/estado` y solicitar procesamiento inmediato con `POST /admin/correos/procesar`.

## Cola y reintentos

- Un correo nuevo empieza como `pendiente`.
- Mientras se entrega pasa a `procesando`.
- El éxito queda en `enviado`, con fecha e identificador del proveedor.
- Un fallo queda en `fallido` y se reintenta con espera exponencial.
- Después de 5 intentos conserva el error para auditoría y deja de reintentarse automáticamente.

Procesamiento manual:

```bash
cd backend
npm run emails:process
```

## Cloud Run y GitHub Actions

Guardar la contraseña SMTP en Secret Manager, no en GitHub ni como variable ordinaria:

```bash
printf '%s' 'credencial-smtp' |
  gcloud secrets create proysocial-smtp-password --data-file=-
```

La cuenta de servicio usada por Cloud Run ya necesita `roles/secretmanager.secretAccessor` para leer este secreto.

Configurar estas variables del repositorio:

- `SMTP_HOST`
- `SMTP_PORT` (normalmente `587`)
- `SMTP_SECURE=false` para STARTTLS en 587; `true` para TLS directo en 465
- `SMTP_USER`
- `SMTP_FROM`, por ejemplo `ProySocial <cuenta-remitente@dominio.edu.co>`
- `SMTP_PASS_SECRET=proysocial-smtp-password` (opcional si se usa ese nombre predeterminado)

El valor de `SMTP_PASS` vive en Secret Manager. El workflow obtiene la URL real de Cloud Run y configura SMTP con esa URL, de modo que los botones de los mensajes apunten al servicio desplegado.
