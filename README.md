# SnG Control Frontend

Frontend de Steel & Glass. Incluye acceso con Google, el flujo operativo Cliente → Proyecto → Documentos → Envío a Presupuestos → SG y Frontend 3A — Gerencia, con resumen ejecutivo y consulta transversal de tareas de SnG-Control-Backend.

## Estado funcional

- Inicio de sesión con el botón oficial de Google Identity Services.
- Durante desarrollo se permite cualquier cuenta Google válida que el backend acepte. La configuración de audiencia y usuarios de prueba del proyecto Google también debe permitir esa cuenta. Los permisos operativos siguen siendo autoridad del backend.
- Google entrega un ID Token. El backend .NET valida ese token y devuelve Subject, Email, Name e `isManagement` (boolean requerido). Solo `isManagement === true` habilita la experiencia de Gerencia; no se infiere por email, nombre o Subject.
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

Frontend 3A conserva el flujo de 2B.5 y ofrece estas rutas protegidas:

| Ruta | Función |
| --- | --- |
| `/` | Accesos rápidos e identidad validada |
| `/clients` | Listar y crear clientes por nombre |
| `/projects` | Listado de proyectos con cliente, ciudad, línea, SG y fecha |
| `/projects/new` | Crear proyecto con un cliente existente y línea Classic, Essential, Bioconfort o Signature |
| `/projects/[id]` | Datos, documentos vigentes/históricos, envío inicial a Presupuestos, SG, tareas y notificaciones |
| `/tasks` | Tareas filtradas explícitamente por área y estado |
| `/notifications` | Notificaciones personales y alertas activas/resueltas |
| `/management` | Resumen ejecutivo, solo Gerencia |
| `/management/tasks` | Operación transversal actual e histórica, solo Gerencia |

Los nombres duplicados de clientes y proyectos están permitidos. El creador autenticado que devuelve el backend es el responsable comercial; no se pide otro responsable al crear.

Comercial carga documentos mediante selección múltiple o arrastrar/soltar y confirma la carga. Se permiten nombres duplicados y cualquier extensión/MIME: los archivos no se previsualizan. Límites: **100 MB por archivo, 300 MB por operación y 15 documentos vigentes**, con validación final del backend. Antes del envío se pueden quitar documentos cuando el backend lo permite; reemplazar conserva el anterior en el historial.

El envío a Presupuestos exige al menos un documento vigente, capacidad autorizada por backend y confirmación. Crea un snapshot inicial descargable y la tarea pendiente, sin iniciar el plazo. Después, los usuarios con capacidad de modificación pueden agregar/reemplazar documentos; Presupuestos consulta y descarga vigentes, históricos, ZIP actual y envío inicial. La actualización genera `ProjectDocumentsUpdated` y no reinicia tarea ni Leak Time. Los proyectos anteriores sin snapshot muestran una indicación de historial inicial no disponible.

Asignar/corregir SG corresponde al usuario de Presupuestos asignado a PrepareQuotation; Comercial consulta el SG y el avance sin controles de edición. La primera asignación de SG inicia el Leak Time; una corrección posterior conserva inicio y vencimiento. SG acepta `SG` seguido de dígitos ASCII, normaliza espacios exteriores/mayúsculas y conserva ceros iniciales. Los plazos y estados se muestran exclusivamente desde backend, con fechas y horas en **America/Bogota**.

Las acciones documentales dependen de `canModify`, `canRemove` y `canSendToBudgets` recibidos del backend. Al cambiar de cuenta se vuelven a cargar los datos y capacidades del proyecto abierto, sin Ctrl+F5. Las descargas usan escritura directa al archivo cuando el navegador la permite; en otros navegadores usan una descarga estándar que requiere memoria para el archivo completo.

Las notificaciones conservan el historial, incluidas alertas de atraso resueltas. No hay leído/no leído ni acciones de descarte. Las mutaciones bloquean dobles envíos y los conflictos de workflow refrescan el estado real.

El detalle reúne encabezado, estado actual, documentación, acciones disponibles y actividad en un expediente continuo con divisores. Las tareas del proyecto muestran sus fechas directamente. El shell combina navegación azul pálido y una cabecera discreta; las demás páginas conservan sus componentes actuales.

Todo usa el BFF y cliente API compartidos. Los archivos siguen siendo documentos opacos; no se implementa importación/preview de cotizaciones Excel, confirmaciones, revisión comercial, aprobación o pago. No hay roles inventados, permisos simulados ni métricas inventadas. Frontend 2C permanece fuera de alcance. Intelligence 1C se integra como experiencia separada de consulta.

## Gerencia — Frontend 3A

Gerencia ve una sección adicional en la barra lateral azul pálido, con Resumen y Operación, y un acceso desde Inicio. La home general se conserva. Las URLs gerenciales muestran una denegación segura a otras cuentas sin consultar esos endpoints. Un 403 no cierra sesión.

El resumen consume `GET /api/management/overview`: proyectos, tareas activas (pendientes + en curso), atrasadas, vencimientos de hoy/próximos, estado del trabajo, comparación por área y tareas que requieren atención. Conserva el orden del backend e indica cuántas muestra si el total supera los elementos recibidos (máximo 10). No inventa tendencias ni calcula plazos.

Operación consume `GET /api/management/tasks`. Muestra tareas actuales e históricas, proyecto/cliente/SG, ciudad/línea, área, estado, situación y fechas en Colombia. Los filtros por área, estado y situación y la búsqueda por proyecto/cliente/SG/ciudad son locales, conservan el orden recibido y se pueden restablecer.

Los enlaces abren el detalle existente para consultar datos, tareas, actividad, documentos, históricos y snapshot inicial. Las descargas siguen sujetas al backend. Gerencia no recibe permisos de escritura por el flag: SG depende del assignee y del estado; documentos y envío a Presupuestos dependen de capabilities. Si una identidad gerencial también tiene esos permisos reales, los conserva. Cambiar de cuenta cancela consultas y limpia datos gerenciales anteriores.

Deuda conocida: el backend aún permite crear clientes/proyectos a cualquier Google autenticado. La UI oculta creación para cuentas con `isManagement: true`, incluso en `/projects/new`. Es **una restricción de UX, no una barrera de seguridad**. El contrato actual no informa una capability general de creación para distinguir Gerencia pura de una identidad mixta; por ello esta ocultación también aplica a identidades mixtas, sin alterar sus permisos específicos en proyectos. Resolverlo requiere una autorización/capability general de Comercial en backend.

Pendiente de smoke real: login/restauración con Gerencia, navegación y endpoints, consulta/descarga autorizada, ausencia de escrituras para Gerencia pura y cambio de cuenta sin hard refresh. Verificar también 375, 768, 1024 px y desktop amplio. Los tests usan red simulada; no sustituyen esa integración.

## SnG Intelligence — Intelligence 1C + Realtime Voice 2B

Solo las cuentas con `user.isManagement === true` ven el botón flotante **Intelligence**, disponible dentro del shell. No se agrega un enlace al Sidebar. Al abrir se verifica el acceso con Intelligence; su autorización real sigue dependiendo del backend. El panel presenta chat, micrófono y referencias a proyectos, con el nombre como dato principal y SG como metadata.

Configura de forma independiente en el entorno del worktree `SNG_INTELLIGENCE_BASE_URL`, solo servidor. Ejemplo de desarrollo: `http://127.0.0.1:8001`. No tiene prefijo NEXT_PUBLIC. El navegador llama únicamente a `/api/intelligence/...` de Next; no recibe URL del servicio ni claves de proveedores. No copies el `.env` de otro worktree; configura el Client ID público y las URLs que correspondan al entorno de prueba.

Chat envía un mensaje por solicitud, sin historial. Enter envía y Shift+Enter agrega una línea. Las respuestas admiten direct, management_brief, project_status, list, comparison, clarification y unavailable. Cifras, estados, áreas y fechas proceden de Intelligence. Seleccionar un candidato genera una pregunta autocontenida con el nombre oficial del proyecto; no presupone memoria del agente. Las referencias de proyectos/tareas abren el proyecto asociado.

El micrófono principal inicia **Voice Live**: un clic solicita permiso, conecta WebRTC y permite conversar continuamente, sin grabar un Blob ni pulsar Enviar. GPT-Live mantiene contexto durante esa conexión y gestiona la conversación/interrupciones; el panel muestra transcripciones, información consultada y estados accesibles. Incluye silenciar/activar micrófono, finalizar conversación y activar audio mediante un gesto si el navegador bloquea autoplay. Requiere HTTPS o localhost y soporte de WebRTC.

“Usar modo de voz básico” conserva el fallback explícito MediaRecorder: hasta 60 segundos y 10 MiB, WebM/Opus, WebM o MP4/M4A. Detener envía a `/voice` y muestra la transcripción/respuesta; la reproducción opcional usa `/voice/speech`. No se cambia de modo automáticamente. “Escuchar respuesta” conserva pausa/reanudación para texto y voz básica; se deshabilita mientras Live está activo para evitar dos audios simultáneos.

El historial visual vive en memoria (hasta 40 mensajes de texto/básicos y 160 fragmentos Live); no se persiste. El audio Live viaja directamente por WebRTC a GPT-Live y sus consultas empresariales pasan por el BFF. La sesión sobrevive navegación interna mientras el panel/shell continúan montados. Cerrar, recargar, logout o cambiar de identidad libera solicitudes, micrófono y audio. En móvil, seguir una referencia cierra el panel. El panel conserva diálogo nativo, scroll, safe areas y adaptación al teclado.

Voz Live y chat textual **no comparten memoria**: “La de Ximena” conserva su contexto dentro de Live, sin reescritura del frontend; un mensaje textual sigue siendo una consulta independiente. Reiniciar Live comienza otro hilo. No se persisten sessionId, SDP, transcripciones ni audio. Backend conserva autoridad de acceso y datos.

Los errores 401 invalidan la sesión existente; 403 mantiene la sesión; 422, 429 y 503 ofrecen mensajes seguros. Solo se presenta un requestId validado como referencia diagnóstica. Una respuesta unavailable es información normal.

Realtime Voice 2B usa los tres POST `/api/intelligence/live/session`, `/live/delegate` y `/live/close` a través del BFF, sobre Intelligence 2A. No agrega claves de OpenAI al frontend, relay de audio WebSocket, ElevenLabs, historial persistente, RAG ni LangGraph. Pendiente: smoke real conjunto con audio, interrupciones, cierre, permisos, cambio de cuenta y tamaños 375/768/1024/desktop. Los tests usan WebRTC y red simulados; no sustituyen esa integración.

La integración real requiere un Client ID configurado y un backend disponible con TLS confiable. El procedimiento de comprobación está en el manual técnico.
