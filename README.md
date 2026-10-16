# SnG Control Frontend

Frontend de Steel & Glass. Incluye acceso con Google y el flujo operativo Cliente → Proyecto → Documentos → Envío a Presupuestos → SG, con tareas y notificaciones de SnG-Control-Backend.

## Estado funcional

- Inicio de sesión con el botón oficial de Google Identity Services.
- Durante desarrollo se permite cualquier cuenta Google válida que el backend acepte, sin restricciones de dominio, roles ni permisos en el frontend. La configuración de audiencia y usuarios de prueba del proyecto Google también debe permitir esa cuenta.
- Google entrega un ID Token. El backend .NET valida ese token y devuelve Subject, Email y Name.
- El shell incluye navegación responsive a Inicio, Clientes, Proyectos, Tareas y Notificaciones, nombre/email y cierre de sesión.
- Inicio ofrece accesos rápidos a proyectos, clientes, tareas y notificaciones. La identidad confirmada conserva Copiar Subject dentro de “Identidad técnica de la sesión”. El login permanece fuera del shell.
- El token se guarda en `sessionStorage` en la pestaña actual, después de una validación exitosa. No se guardan los datos de identidad como autoridad separada.
- Al recargar, la identidad se consulta otra vez al backend. Mientras se verifica, no se muestra contenido autenticado.
- Un 401 de la API limpia globalmente la sesión y lleva a login. Un 403 muestra falta de permiso sin cerrar sesión; un 409 conserva el código de conflicto del backend.
- Un fallo temporal durante login/restauración impide autenticar y requiere reintentar. Un fallo temporal de una operación de negocio no elimina una sesión ya validada.
- Cerrar sesión elimina el token y la identidad local y vuelve a `/login`. No cierra la cuenta Google globalmente.

La sesión está limitada a la sesión de página del navegador. Normalmente termina al cerrar la pestaña; duplicar pestañas o restaurar una sesión del navegador puede conservar una copia según el navegador. Cada restauración exige validación del backend. No hay renovación automática del token.

## Ejecutar

Se requiere Node.js 24 y pnpm 11.5.0. Consulta [README_TECHNICAL.md](README_TECHNICAL.md) para la configuración de Google, backend y TLS.

```powershell
pnpm install --frozen-lockfile
```

La configuración local usa deliberadamente `.env`, ignorado por Git. Define `NEXT_PUBLIC_GOOGLE_CLIENT_ID` y `SNG_API_BASE_URL` sin versionar sus valores. Conserva el archivo existente. Para confiar en las CA del sistema en desarrollo Windows:

```powershell
$env:NODE_USE_SYSTEM_CA="1"
pnpm dev
```

Abre la URL local que imprime Next.js y entra a `/login`. No se incluyen credenciales reales.

## Alcance actual

Frontend 2B.5 ofrece estas rutas protegidas:

| Ruta | Función |
| --- | --- |
| `/` | Accesos rápidos e identidad validada |
| `/clients` | Listar y crear clientes por nombre |
| `/projects` | Listado de proyectos con cliente, ciudad, línea, SG y fecha |
| `/projects/new` | Crear proyecto con un cliente existente y línea Classic, Essential, Bioconfort o Signature |
| `/projects/[id]` | Datos, documentos vigentes/históricos, envío inicial a Presupuestos, SG, tareas y notificaciones |
| `/tasks` | Tareas filtradas explícitamente por área y estado |
| `/notifications` | Notificaciones personales y alertas activas/resueltas |

Los nombres duplicados de clientes y proyectos están permitidos. El creador autenticado que devuelve el backend es el responsable comercial; no se pide otro responsable al crear.

Comercial carga documentos mediante selección múltiple o arrastrar/soltar y confirma la carga. Se permiten nombres duplicados y cualquier extensión/MIME: los archivos no se previsualizan. Límites: **100 MB por archivo, 300 MB por operación y 15 documentos vigentes**, con validación final del backend. Antes del envío se pueden quitar documentos cuando el backend lo permite; reemplazar conserva el anterior en el historial.

El envío a Presupuestos exige al menos un documento vigente, capacidad autorizada por backend y confirmación. Crea un snapshot inicial descargable y la tarea pendiente, sin iniciar el plazo. Después, los usuarios con capacidad de modificación pueden agregar/reemplazar documentos; Presupuestos consulta y descarga vigentes, históricos, ZIP actual y envío inicial. La actualización genera `ProjectDocumentsUpdated` y no reinicia tarea ni Leak Time. Los proyectos anteriores sin snapshot muestran una indicación de historial inicial no disponible.

Asignar/corregir SG corresponde al usuario de Presupuestos asignado a PrepareQuotation; Comercial consulta el SG y el avance sin controles de edición. La primera asignación de SG inicia el Leak Time; una corrección posterior conserva inicio y vencimiento. SG acepta `SG` seguido de dígitos ASCII, normaliza espacios exteriores/mayúsculas y conserva ceros iniciales. Los plazos y estados se muestran exclusivamente desde backend, con fechas y horas en **America/Bogota**.

Las acciones documentales dependen de `canModify`, `canRemove` y `canSendToBudgets` recibidos del backend. Al cambiar de cuenta se vuelven a cargar los datos y capacidades del proyecto abierto, sin Ctrl+F5. Las descargas usan escritura directa al archivo cuando el navegador la permite; en otros navegadores usan una descarga estándar que requiere memoria para el archivo completo.

Las notificaciones conservan el historial, incluidas alertas de atraso resueltas. No hay leído/no leído ni acciones de descarte. Las mutaciones bloquean dobles envíos y los conflictos de workflow refrescan el estado real.

El detalle reúne encabezado, estado actual, documentación, acciones disponibles y actividad en un espacio de trabajo responsive. El historial de tareas conserva las fechas en “Fechas y seguimiento”. Las listas y formularios comparten estados, botones y tipografía Steel & Glass.

Todo usa el BFF y cliente API compartidos. Los archivos siguen siendo documentos opacos; no se implementa importación/preview de cotizaciones Excel, confirmaciones, revisión comercial, aprobación o pago. No hay roles, permisos simulados ni métricas inventadas. El alcance termina en **Frontend 2B.5**, antes de 2C.

Pendiente funcional: crear proyectos continúa disponible para cualquier usuario autenticado, según la autorización actual del backend. No se oculta esta acción mediante email, Subject o inferencias de rol.

La integración real requiere un Client ID configurado y un backend disponible con TLS confiable. El procedimiento de comprobación está en el manual técnico.
