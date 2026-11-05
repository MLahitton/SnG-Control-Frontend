# SnG Control Frontend

Frontend de Steel & Glass. Incluye acceso con Google, el flujo operativo Cliente → Proyecto → Documentos → Presupuestos → SG → Cotización XLSX → Revisión Comercial → Asesor responsable, y Frontend 3A — Gerencia, con resumen ejecutivo y consulta transversal de tareas de SnG-Control-Backend. El flujo implementado termina al iniciar la tarea de presentación al cliente.

## Estado funcional

- Inicio de sesión con el botón oficial de Google Identity Services.
- Google valida identidad; Backend determina las membresías explícitas y autoriza cada operación por área activa. Una cuenta sin roles ve un mensaje seguro y no entra a la experiencia operacional.
- Google entrega un ID Token. Backend devuelve subject, email, name, roles (strings cerrados) e isManagement derivado por compatibilidad. La experiencia utiliza roles y un único ActiveRole validado, nunca email/nombre ni el flag como fuente de áreas.
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
| `/projects/[id]` | Datos, documentos, envío a Presupuestos, SG, cotización técnica, revisión Comercial, tareas y notificaciones |
| `/tasks` | Bandeja personal del área activa, filtrable por estado |
| `/notifications` | Notificaciones personales y alertas activas/resueltas |
| `/management` | Resumen ejecutivo, solo Gerencia |
| `/management/tasks` | Operación transversal actual e histórica, solo Gerencia |

Los nombres duplicados de clientes y proyectos están permitidos. El creador autenticado que devuelve el backend es el responsable comercial; no se pide otro responsable al crear.

Comercial carga documentos mediante selección múltiple o arrastrar/soltar y confirma la carga. Se permiten nombres duplicados y cualquier extensión/MIME: los archivos no se previsualizan. Límites: **100 MB por archivo, 300 MB por operación y 15 documentos vigentes**, con validación final del backend. Antes del envío se pueden quitar documentos cuando el backend lo permite; reemplazar conserva el anterior en el historial.

El envío a Presupuestos exige al menos un documento vigente, capacidad autorizada por backend y confirmación. Crea un snapshot inicial descargable y la tarea pendiente, sin iniciar el plazo. Después, los usuarios con capacidad de modificación pueden agregar/reemplazar documentos; Presupuestos consulta y descarga vigentes, históricos, ZIP actual y envío inicial. La actualización genera `ProjectDocumentsUpdated` y no reinicia tarea ni Lead Time. Los proyectos anteriores sin snapshot muestran una indicación de historial inicial no disponible.

Asignar/corregir SG corresponde al usuario con Budgets activo asignado a PrepareQuotation; Comercial consulta el SG y el avance sin controles de edición. La primera asignación de SG inicia el Lead Time; una corrección posterior conserva inicio y vencimiento. SG acepta `SG` seguido de dígitos ASCII, normaliza espacios exteriores/mayúsculas y conserva ceros iniciales. Los plazos y estados se muestran exclusivamente desde backend, con fechas y horas en **America/Bogota**.

Las acciones documentales dependen de `canModify`, `canRemove` y `canSendToBudgets` recibidos del backend. Al cambiar de cuenta se vuelven a cargar los datos y capacidades del proyecto abierto, sin Ctrl+F5. Las descargas usan escritura directa al archivo cuando el navegador la permite; en otros navegadores usan una descarga estándar que requiere memoria para el archivo completo.

Las notificaciones conservan el historial, incluidas alertas de atraso resueltas. No hay leído/no leído ni acciones de descarte. Las mutaciones bloquean dobles envíos y los conflictos de workflow refrescan el estado real.

El detalle reúne encabezado, estado actual, documentación, acciones disponibles y actividad en un expediente continuo con divisores. Las tareas del proyecto muestran sus fechas directamente. El shell combina navegación azul pálido y una cabecera discreta; las demás páginas conservan sus componentes actuales.

Todo usa el BFF y cliente API compartidos. Los documentos generales siguen siendo opacos. La cotización XLSX tiene los flujos de Presupuestos y revisión Comercial descritos a continuación; presentación al cliente, aprobación y pago siguen pendientes. No hay roles inventados, permisos simulados ni métricas inventadas. Intelligence se integra como experiencia separada de consulta.

## Presupuestos — cotización XLSX y envío a Comercial (4C/4D)

En el detalle del proyecto, después de las acciones de SG y antes de actividad/tareas, aparece **Cotización de Presupuestos** para el Subject asignado a PrepareQuotation, con tarea InProgress o Completed. El editor requiere tarea InProgress, SG existente y estado oficial NotConfirmed. La autorización real sigue en backend.

Selecciona un único `.xlsx` estándar con hoja **COTIZACIÓN** y SG coincidente, y pulsa **Generar preview**. El backend extrae metadata, ítems principales/adicionales en su orden, imágenes y advertencias. La falta o ambigüedad de imágenes no impide confirmar. Las imágenes se muestran solo con MIME raster permitido; no se acepta SVG ni HTML.

Puedes corregir exactamente once campos: número, ubicación, sistema, cristal, acabado de aluminio, cerradura, observaciones, ancho, alto, m² y cantidad. El número es obligatorio; medidas mayores que cero y cantidad entera positiva. Se recortan espacios exteriores; no se recalculan m², cantidades ni totales. No se agregan/eliminan ítems ni se cambia su identidad original.

**Confirmar cotización** envía el mismo archivo del preview y los valores revisados. La respuesta muestra versión, fecha, cantidades del backend y cuántos ítems fueron ajustados. **Confirmar NO completa PrepareQuotation**: el proyecto continúa en Presupuestos hasta enviarlo a Comercial.

El preview es stateless: archivo y correcciones permanecen solo en memoria React. Cambiar archivo, proyecto, Subject o SG limpia el borrador; recargar también lo pierde. Durante las solicitudes se bloquean dobles envíos y cambios incompatibles. No se guardan XLSX ni previews en almacenamiento del navegador.

Al abrir o recargar, se consulta `GET projects/{id}/budget-quotation/status`: NotConfirmed mantiene el flujo de carga; Confirmed muestra versión, fecha, cantidades y la vista completa confirmada sin volver a ofrecer el editor; SentToCommercial conserva ese snapshot histórico incluso con PrepareQuotation completada. No se usa almacenamiento del navegador para recuperar el estado.

**Enviar a Comercial** aparece únicamente cuando backend devuelve `canSendToCommercial=true`. Primero pide confirmación humana; Cancelar no envía nada. Confirmar ejecuta el POST existente sin body. Las tareas de la respuesta se muestran de inmediato y se refrescan estado, tareas y actividad: PrepareQuotation Completed y ReviewQuotation InProgress con fechas y notificación del backend. No hay envío automático ni cálculos locales de deadlines.

Si cambió el SG después de confirmar, se muestran ambos SG y el bloqueo sin corregir archivos ni catálogo. Los estados incompatibles y conflictos ofrecen mensajes seguros y actualización. El estado “Enviada a Comercial” sobrevive F5 y no vuelve a ofrecer envío.

## Cotizaciones confirmadas en el expediente

La información confirmada permanece dentro del proyecto después de F5, handoffs, cambio de área o nueva sesión. Las vistas de Presupuestos y Comercial consultan Backend y muestran los snapshots persistidos, separadas de los previews temporales y de las acciones actuales.

Presupuestos conserva metadata documental, SG histórico, todos los ítems, valores técnicos confirmados, ajustes frente a la extracción e imágenes bajo demanda. Comercial conserva valores técnicos, precios unitarios, totales por ítem, total del proyecto y diferencias frente a Presupuestos. Presupuestos muestra además los precios unitarios, subtotales y total originales del Excel de esa versión, en COP y solo lectura. Backend recupera esos importes del original conservado; no se recalcula economía ni se usan precios comerciales posteriores.

El asesor original y Gerencia consultan ambas vistas. Presupuestos consulta su snapshot con tarea asignada. El Jefe Comercial consulta ambas con ReviewQuotation asignada y puede revisar el contenido de Presupuestos antes de descargar el archivo operativo. Las acciones siguen limitadas al área activa y al workflow; las vistas son de solo lectura. Las descargas existentes se conservan. Si no hay cotización confirmada, no se muestra una sección vacía.

## Revisión Comercial de cotización (4E)

El expediente muestra **Revisión Comercial** al usuario con CommercialHead activo cuyo Subject coincide con el asignado a ReviewQuotation. Con tarea InProgress puede descargar la cotización operativa de Presupuestos, editarla externamente en Excel y seleccionar un único `.xlsx` revisado. La autorización real corresponde al backend; email, nombre, creador del proyecto e indicador de Gerencia no conceden esta acción.

Antes de subir el XLSX comercial, se debe recalcular completamente, revisar y guardar en Excel.
El preview muestra valores guardados; no calcula fórmulas. Los errores RecalculationRequired e
InconsistentFormulaCache impiden continuar e indican revisar el archivo. La confirmación solicita
comparar precios y total con el Excel guardado; la ausencia de errores no certifica la vigencia de
todas las dependencias del libro.

**Generar preview** muestra el total del proyecto, precios unitarios/totales, ítems en el orden recibido y diferencias técnicas con atribución **Antes (Presupuestos)** / **Ahora (Comercial)**. Es solo lectura: no hay edición web ni cálculos económicos locales. Para cambiar valores se edita Excel y se genera otro preview. Reemplazar el archivo, incluso con el mismo nombre, descarta el preview y la confirmación pendiente.

**Confirmar cotización comercial** requiere una confirmación humana; Cancelar no envía nada. Se remite exactamente el mismo archivo del preview para que backend vuelva a interpretarlo. El éxito muestra ReviewQuotation Completed y PresentQuotationToClient InProgress asignada por backend al asesor creador original, y actualiza tareas/actividad. No se calculan fechas ni se implementa todavía la presentación al cliente.

Tras confirmar, el Jefe Comercial consulta el resumen y puede **Descargar cotización final**, sin otro upload/preview/confirmación. F5 recupera el estado completado desde las tareas oficiales. Después de F5 se vuelve a consultar el snapshot comercial completo, incluidos valores técnicos, precios, total del proyecto y diferencias; también permanece la cotización histórica de Presupuestos. Los archivos se conservan únicamente en memoria durante la operación y se descartan al cambiar de cuenta/proyecto.

Los errores de estructura muestran filas faltantes/inesperadas por sección; no se intenta reconciliar el Excel. Conflictos de SG, economía, archivo, permisos o confirmación previa tienen mensajes seguros. AlreadyConfirmed refresca las tareas y bloquea otra confirmación. Las descargas mantienen los bytes del servidor y su filename en la descarga convencional; con selector nativo se respeta el nombre elegido por el usuario.

**Deuda funcional conocida:** el backend actual soporta la primera cotización de Presupuestos y la primera confirmación Comercial. El futuro ciclo cliente solicita cambios → Comercial registra solicitud → vuelve a Presupuestos → Jefe Comercial notificado → nueva cotización → nueva revisión → nueva presentación aún no está implementado. 4E conserva las invariantes V1.

## Gerencia — Frontend 3A

Gerencia ve una sección adicional en la barra lateral azul pálido, con Resumen y Operación, y un acceso desde Inicio. La home general se conserva. Las URLs gerenciales muestran una denegación segura a otras cuentas sin consultar esos endpoints. Un 403 no cierra sesión.

El resumen consume `GET /api/management/overview`: proyectos, tareas activas (pendientes + en curso), atrasadas, vencimientos de hoy/próximos, estado del trabajo, comparación por área y tareas que requieren atención. Conserva el orden del backend e indica cuántas muestra si el total supera los elementos recibidos (máximo 10). No inventa tendencias ni calcula plazos.

Operación consume `GET /api/management/tasks`. Muestra tareas actuales e históricas, proyecto/cliente/SG, ciudad/línea, área, estado, situación y fechas en Colombia. Los filtros por área, estado y situación y la búsqueda por proyecto/cliente/SG/ciudad son locales, conservan el orden recibido y se pueden restablecer.

Los enlaces abren el detalle existente para consultar datos, tareas, actividad, documentos, históricos y snapshot inicial. Las descargas siguen sujetas al backend. Gerencia no recibe permisos de escritura por el flag: SG depende del assignee y del estado; documentos y envío a Presupuestos dependen de capabilities. Si una identidad gerencial también tiene esos permisos reales, los conserva. Cambiar de cuenta cancela consultas y limpia datos gerenciales anteriores.

Crear clientes/proyectos requiere CommercialAdvisor activo tanto en UI como en Backend. Tener varios roles no mezcla controles: cada experiencia exige su área, las capabilities oficiales y, cuando corresponde, ownership o tarea asignada.

Pendiente de smoke real: login/restauración con Gerencia, navegación y endpoints, consulta/descarga autorizada, ausencia de escrituras para Gerencia pura y cambio de cuenta sin hard refresh. Verificar también 375, 768, 1024 px y desktop amplio. Los tests usan red simulada; no sustituyen esa integración.

## SnG Intelligence — Intelligence 1C + Realtime Voice 2C

Solo las cuentas con Management disponible y activo ven el botón flotante **Intelligence** dentro del shell. Al salir de Gerencia se desmonta el panel y se liberan voz y requests; el hilo durable permanece en Intelligence. Intelligence verifica acceso con Backend y usa un rol Management fijo en sus lecturas.

Configura de forma independiente en el entorno del worktree `SNG_INTELLIGENCE_BASE_URL`, solo servidor. Ejemplo de desarrollo: `http://127.0.0.1:8001`. No tiene prefijo NEXT_PUBLIC. El navegador llama únicamente a `/api/intelligence/...` de Next; no recibe URL del servicio ni claves de proveedores. No copies el `.env` de otro worktree; configura el Client ID público y las URLs que correspondan al entorno de prueba.

Chat envía un mensaje y el conversationId generado por Intelligence. El historial semántico compartido es durable en PostgreSQL propio de Intelligence. Enter envía y Shift+Enter agrega una línea. Las respuestas admiten direct, management_brief, project_status, list, comparison, clarification y unavailable. Cifras, estados, áreas y fechas proceden de Intelligence. Seleccionar un candidato genera una pregunta autocontenida con el nombre oficial del proyecto; aprovecha el contexto reciente sin convertirlo en evidencia operacional. Las referencias de proyectos/tareas abren el proyecto asociado.

El micrófono principal inicia **Voice Live**: un clic solicita permiso, conecta WebRTC y permite conversar continuamente, sin grabar un Blob ni pulsar Enviar. GPT-Live mantiene contexto durante esa conexión y gestiona la conversación/interrupciones; el panel muestra transcripciones y estados accesibles. Incluye silenciar/activar micrófono, finalizar conversación y activar audio mediante un gesto si el navegador bloquea autoplay. Requiere HTTPS o localhost y soporte de WebRTC.

“Usar modo de voz básico” conserva el fallback explícito MediaRecorder: hasta 60 segundos y 10 MiB, WebM/Opus, WebM o MP4/M4A. Detener envía a `/voice` y muestra la transcripción/respuesta; la reproducción opcional usa `/voice/speech`. No se cambia de modo automáticamente. “Escuchar respuesta” conserva pausa/reanudación para texto y voz básica; se deshabilita mientras Live está activo para evitar dos audios simultáneos.

El historial visual vive en memoria (hasta 40 mensajes de texto/básicos y 160 fragmentos Live); no se persiste. El audio Live viaja directamente por WebRTC a GPT-Live y sus consultas empresariales se ejecutan exclusivamente en el sideband privado de SnG Intelligence. La sesión sobrevive navegación interna mientras el panel/shell continúan montados. Cerrar el panel libera solicitudes, micrófono, audio y captions, pero conserva mensajes/contexto. Recargar retoma el hilo por subject mediante resume; logout o cambio de identidad limpia el estado local y cierra Live, sin archivar el hilo durable. En móvil, seguir una referencia cierra el panel. El panel conserva diálogo nativo, scroll, safe areas y adaptación al teclado.

Voz Live y chat textual **comparten contexto conversacional durable** con el mismo conversationId. “La de Ximena” o “el segundo” se resuelven con contexto de Intelligence, sin reescritura del frontend. Reiniciar Live conserva el contexto empresarial reciente; las tools vuelven a consultar datos actuales. No se persisten sessionId, SDP, transcripciones ni audio. Backend conserva autoridad de acceso y datos.

Los errores 401 invalidan la sesión existente; 403 mantiene la sesión; 422, 429 y 503 ofrecen mensajes seguros. Solo se presenta un requestId validado como referencia diagnóstica. Una respuesta unavailable es información normal.

Realtime Voice 2C usa únicamente POST `/api/intelligence/live/session` y `/live/close` por BFF. Intelligence adjunta el sideband antes del 201. El navegador no ejecuta tools ni envía resultados al modelo. Live muestra captions; las tarjetas y referencias semánticas siguen en chat y voz básica. No agrega claves de OpenAI al frontend, relay de audio WebSocket, ElevenLabs, historial persistente, RAG ni LangGraph. Pendiente: smoke real conjunto con audio, interrupciones, cierre, permisos, cambio de cuenta y tamaños 375/768/1024/desktop. Los tests usan WebRTC y red simulados; no sustituyen esa integración.

La integración real requiere un Client ID configurado y un backend disponible con TLS confiable. El procedimiento de comprobación está en el manual técnico.

## Performance 2D

La conversación Voice 2C conserva WebRTC y tools exclusivamente server-side.
La medición local usa `performance.now()` y el medidor de energía de audio existente:
fin de actividad de entrada → nuevo inicio de actividad remota. Es una estimación,
no VAD del proveedor ni prueba de primera respuesta útil; el medidor tiene 250 ms de
hangover y el ruido/solapamiento pueden afectar el resultado. Captions no alimentan
telemetría. Sin AudioContext o con reproducción bloqueada no se fabrica una medición.

Se muestra “Pensando…” al terminar la actividad de voz mientras se espera. No hay filler.
En desarrollo se emite `live_latency` con tiempos numéricos y categoría fija únicamente;
no se envía a analytics, no se persiste, no contiene nombres, IDs, transcripts ni tokens.
El estado se limpia al cambiar de turno, mutear, cerrar, cambiar identidad o desmontar.
Para comparar fases server-side consultar `PERFORMANCE_2D.md` de SnG Intelligence;
los relojes browser/servidor no se restan entre sí.


## Persistent Conversations V1

Al abrir Intelligence se verifica Gerencia y se llama `POST conversation/resume`: el servidor
retoma el único hilo abierto del subject o crea uno si no existe. ID y mensajes visibles son
cache React; no se usa localStorage, sessionStorage, cookies ni IndexedDB para conversaciones.
F5, reabrir navegador y reiniciar Intelligence conservan el hilo en PostgreSQL propio del servidor.
El historial visual sigue siendo local: V1 no añade una pantalla/listado de historial ni reconstruye
las tarjetas antiguas. La siguiente consulta sí usa el contexto semántico reciente del mismo hilo.

Texto y Live envían el mismo conversationId. Live sigue siendo temporal (máximo 600 s):
expirar/desconectar voz permite reconectarla y continuar el hilo. **Nueva conversación** detiene
Live, limpia mensajes/referencias/audio y pide crear un hilo vacío, archivando el anterior.
Cerrar el panel, logout o cambio de identidad libera estado local/media, sin cerrar el hilo durable.

Solo `404 conversation_unavailable` dispara resume y un reintento de la misma operación.
En Live se cierran peer/tracks provisionales antes de recuperar el ID y crear una nueva conexión.
No hay loops ni retry automático para otros 404, 409, 429 o 5xx. Si el segundo intento falla,
se informa el error. Los IDs de la versión antigua en RAM se recuperan por este mismo mecanismo.

Intelligence guarda todos los turnos validados, sin TTL de conversación. El modelo recibe una
ventana reciente acotada a 16 turnos/16000 caracteres; no se elimina historial por ese límite.
Backend vuelve a consultarse para hechos actuales; el historial identifica referentes, no aporta
evidencia vigente. No se persisten tokens, audio, SDP, reasoning ni protocolos del proveedor.
Voz básica sigue independiente; captions parciales y charla Live sin delegación no forman historial.

Tests offline cubren resume tras remount, texto/Live con el mismo ID, nuevo hilo, cambio de
identidad, errores y recuperación única. El smoke manual de esta fase requiere la DB de
Intelligence configurada/migrada: dos turnos, restart/F5, mismo ID y tercer turno referencial.
La aprobación previa del smoke cross-modal 3A no sustituye esa validación de persistencia.


## Management Intelligence 4A

El panel existente presenta resúmenes ejecutivos y comparaciones actuales de 2–4 proyectos,
con nombres principales, SG auxiliar, links verificados, métricas y tareas desplegables.
Las tarjetas comparativas usan columnas en escritorio y se apilan en móvil; campos opcionales
ausentes se omiten. Las áreas también se muestran como tarjetas accesibles, sin scroll
horizontal obligatorio. El brief puede mostrar cobertura parcial (datos recuperados/total),
sin confundir una muestra con toda la operación.

Intelligence construye los datos desde Backend; el Frontend no calcula plazos, estados,
riesgos ni prioridades. Texto/Live conservan la misma conversación durable y referencias
ordenadas. Captions Live siguen sin convertirse en tarjetas verificadas. La arquitectura
WebRTC, sideband, credenciales, BFF y rutas no cambian.

La validación real de estas capacidades queda para el smoke manual: resumen ejecutivo,
atención de hoy, carga por áreas, comparación de dos proyectos existentes, «¿Cuál tiene
más pendientes?», por voz «¿Y cuál vence primero?», cuello de botella y facturación no
disponible. Revisar también móvil y «Amplía el segundo proyecto» al volver a texto.
No conservar audio, SDP, credenciales ni transcripciones del smoke en el repositorio.


## Management Intelligence 4B — contenido de documentos de proyecto

Intelligence ahora devuelve `document_analysis` con respuesta humana y fuentes verificadas.
El panel muestra nombre del proyecto, archivos, Actual/Histórico, fecha en America/Bogota,
envío inicial cuando corresponde y tamaño si está disponible. Cada enlace abre `/projects/[id]`.
Las listas de metadata y las aclaraciones también admiten fuentes documentales.
No hay visor ni descarga de bytes dentro de Intelligence; el navegador no llama a OpenAI Files,
Responses ni herramientas documentales. El detalle operacional de documentos existente no cambia.

Los contratos y parser admiten referencias `type: document` (documentId, projectId, label),
`DocumentSource` y `document_analysis` con `project`, `relatedProjects` opcional y `sources`.
La selección, permisos, bytes, límite de cuatro archivos/20 MB por archivo/30 MB total y análisis
son responsabilidad de Intelligence y Backend. No se infiere estado actual desde un documento.
Conversation conserva el mismo conversationId en texto/Live/texto; las referencias son devueltas
por Intelligence, nunca reenviadas por el navegador como autoridad. Live conserva su protocolo
WebRTC/sideband: el browser no ejecuta tools. Las respuestas documentales de chat/voz básica
usan el renderizador compartido; Live mantiene captions y voz, sin un nuevo canal de fuentes.
No hay RAG, índices, File Search ni persistencia documental en Frontend.

Smoke pendiente 4B: en el mismo panel, listar archivos de un proyecto real, resumir los actuales,
preguntar por un PDF real, requisitos de vidrio, metadata del envío inicial, comparar versiones
solo si Backend expone relación, preguntar por protección UV y seguir por Live con «ese documento».
Comprobar fuentes, contexto y navegación sin requests de archivos hacia OpenAI desde el browser.
Los tests offline no sustituyen esta comprobación real.

## Selección de área

Con un rol se selecciona automáticamente; con varios se muestra el selector inicial.
El selector **Trabajando como** permite cambiar entre Asesor Comercial, Presupuestos,
Jefe Comercial, Contabilidad y Gerencia sin cambiar cuenta ni token. Solo aparecen áreas disponibles.
Sin roles se muestra «Tu cuenta no tiene un área asignada en SnG Control.»

Asesor, Presupuestos y Jefe ven Inicio, Clientes, Proyectos, Tareas y Notificaciones.
Gerencia muestra Resumen, Operación, Clientes y Proyectos, conservando Intelligence,
siempre de solo lectura. Inicio reutiliza los accesos de la misma matriz.

El área activa define lectura y acciones por separado; ver un módulo no concede escritura.
Backend es la autoridad del ámbito: Frontend muestra los proyectos y clientes que devuelve.

| Área activa | Clientes | Proyectos | Escritura |
| --- | --- | --- | --- |
| CommercialAdvisor | Registro compartido | Propios | Crear cliente/proyecto, documentos propios y envío inicial |
| Budgets | Relacionados con sus proyectos | PrepareQuotation asignada, incluso Completed | Workflow de Presupuestos |
| CommercialHead | Relacionados con sus proyectos | ReviewQuotation asignada, incluso Completed | Revisión Comercial |
| Management | Todos | Todos | Ninguna |

Clientes permite abrir un detalle de solo lectura con sus proyectos accesibles. Solo Asesor
ve controles de creación. La asignación de tareas conserva el acceso histórico y no cambia
al seleccionar otra área. Jefe no tiene edición de documentos generales ni acciones Budget.
Un listado vacío en Presupuestos/Jefatura se presenta como ausencia de proyectos disponibles.
Tareas muestra únicamente trabajo asignado al Subject actual dentro del rol activo:

| Rol | Área fija | Tipo autorizado por Backend | Estado inicial |
| --- | --- | --- | --- |
| Presupuestos | Budgets | PrepareQuotation | Pendiente |
| Jefe Comercial | Commercial | ReviewQuotation | En curso |
| Contabilidad | Accounting | RegisterInitialDeposit | Pendiente |
| Asesor Comercial | Commercial | PresentQuotationToClient | En curso |

Solo se puede filtrar Estado (Pendiente/En curso/Completada). El cambio de área se hace en
«Trabajando como» y reinicia filtros, datos y consultas. Los vacíos se explican por rol.
Gerencia utiliza Operación; /tasks no consulta la bandeja personal bajo Management.
Proyectos sigue siendo el contexto legible y «Tareas del proyecto» conserva el historial
completo autorizado, incluidas tareas de otras áreas. Acceso histórico al expediente no
convierte esas tareas en trabajo propio.

La preferencia de área se guarda en sessionStorage y se revalida contra /auth/me tras
cada reload. No concede permisos: Backend valida X-SnG-Active-Role en cada request.
Cambiar área cancela consultas, limpia estados, remonta la experiencia y abre su inicio;
logout o cambio de Subject descartan la preferencia anterior. El responsable comercial
del proyecto y las asignaciones permanecen intactos; el header muestra el área de sesión.


## Estabilidad de turnos Live

El micrófono solicita constraints estándar opcionales: `echoCancellation`, `noiseSuppression`,
`autoGainControl` y `channelCount: 1`. Si la combinación produce `OverconstrainedError`, se intenta
una sola vez `audio: true`; errores de permiso o dispositivo no disparan ese fallback.
Los navegadores pueden ignorar constraints. Esto mitiga eco/ruido sin garantizar su eliminación.

Se mantiene full-duplex, mute manual (`track.enabled`) y `playbackBlocked`/`resumeAudio()`.
No se apaga el micrófono durante la respuesta ni se envía `response.cancel`. `activity.ts`
sigue siendo un medidor para UI/latencia, nunca control de turno ni VAD.

Los terminales `response.completed/failed/incomplete` conservan su correlación. Limpian `working`
y `responses`; eventos duplicados o tardíos no afectan una respuesta posterior. Al completar se
descarta la estimación acústica pendiente para evitar un Pensando indefinido, sin declarar que
el audio haya terminado. Failed/incomplete muestran error de delegación y cierran la sesión.
Todos los cierres limpian trabajo inmediatamente, sin esperar el ACK remoto. `session.closed`
inesperado se muestra como expired/network/unavailable, nunca como una sesión aún escuchando.

En desarrollo, `live_event` registra únicamente categoría, estado, número de respuesta,
working_count y fallo clasificado. No imprime eventos crudos, IDs, transcripts, SDP o credenciales.
El servidor Intelligence mantiene el diagnóstico estructurado correlacionado por request_id.
No se agrega un endpoint de telemetry ni persistencia del navegador.

Smoke manual pendiente: (A) audífonos y respuesta completa; (B) repetir con altavoces a volumen
normal; (C) sonido breve sin habla durante la respuesta, que no debería cortarla; (D) decir
«espera, otra cosa» claramente y completar la nueva pregunta, comprobando barge-in intencional.
Verificar también mute/reactivación y playback bloqueado. Registrar solo resultado, dispositivo,
navegador y metadata segura, sin grabaciones ni transcripts. Si el fallo aparece solo con altavoces,
documentar la diferencia de hardware/browser antes de considerar otra mitigación. Los tests no
simulan eco real; la aprobación acústica requiere este smoke.


Money Contract V1: preview, confirmación y vista comercial requieren `currencyCode: "COP"`
del Backend. Los parsers cerrados conservan el campo y rechazan moneda ausente/desconocida;
Budget no lo incorpora. Ajuste contractual necesario para aceptar el nuevo payload sin 502,
sin cambios de UI, cálculos ni formato. Desplegar junto con Backend Money Contract V1.


## Commercial Presentation Outcome V1

El detalle del proyecto muestra Respuesta del cliente cuando existe la tarea de presentación.
El asesor asignado, con rol CommercialAdvisor activo y presentación InProgress, puede elegir
Aprobó la cotización, Solicitó cambios o Rechazó la cotización y una nota opcional (2000 caracteres).
Una confirmación explícita avisa que la respuesta no es editable. El envío deshabilita controles;
tras 201 se relee la decisión y las tareas/notificaciones oficiales. Si falla la actualización
posterior no se habilita un nuevo registro de una operación ya guardada.

Los demás roles con acceso ven la respuesta en modo lectura. F5 vuelve a consultar Backend;
no hay almacenamiento local de la decisión. La fecha se presenta en America/Bogota. Ausencia
no significa rechazo. Los conflictos y permisos se muestran con mensajes seguros.

El BFF admite GET/POST a projects/{id}/client-quotation-decision; servicios del feature validan
el contrato cerrado, IDs de proyecto/tarea y timestamps con zona horaria. 201 tiene outcome y
task; GET entrega available y los campos de la decisión (null si no existe). Desplegar primero
la migración/contrato Backend. No se crean transiciones de pago, recotización o cierre.

## Versioned Requotation Loop V2

Las tareas y previews muestran su ronda; la cotización confirmada muestra su versión.
El asesor asignado puede solicitar una nueva cotización después de una respuesta oficial
ChangesRequested: debe redactar cambios formales y confirmar. La nota de la decisión no
se copia al formulario. Presupuestos ve los cambios en el historial antes del editor.
La nueva tarea inicia con el SG existente; los flujos de preview, confirmación y envío a
Comercial trabajan sobre esa ronda. Una preparación nueva no sustituye la última comercial
confirmada. La decisión actual pertenece a la cotización comercial actual.

El historial es de solo lectura, usa fechas de Colombia y muestra las primeras 20 rondas
con advertencia explícita si es parcial. F5 recupera el estado oficial del servidor; no se
reconstruye a partir de mensajes locales. Los contratos rechazan rondas/versiones inválidas.
La recotización no registra pagos ni cierra proyectos, y nunca es automática.


## Verificación del anticipo

En el expediente, el asesor responsable ve la sección solo cuando Backend confirma la etapa
de cotización Approved. Puede cargar varios comprobantes, sustituir versiones conservando
historial y elegir cuáles enviar a Contabilidad. Cargar no envía ni confirma dinero: el envío
requiere confirmación humana y conserva una clave idempotente durante los reintentos.

La bandeja de Contabilidad mantiene proyecto, cliente y SG. La persona asignada consulta
cotización, archivos exactos de cada solicitud e historial; aprueba con importe COP positivo,
fecha/hora de recepción (Colombia) y observación opcional, o rechaza con observación obligatoria.
Ambas decisiones requieren confirmación. Rechazo permite corregir y enviar otra solicitud;
aprobación registra el anticipo y crea la tarea de Toma de medidas para Instalación sin SLA.
No se implementan formularios ni navegación de la siguiente fase.

Tras escribir se relee Backend y se actualizan tareas/notificaciones. F5 recupera el estado
oficial. Un 409 actualiza sin reintentar automáticamente la escritura. Management y otros roles
autorizados ven evidencia de solo lectura. No se infieren pago total, porcentaje esperado,
saldo ni sumas de comprobantes. El importe viaja como string decimal COP, sin floating point.

El despliegue requiere la migración de comprobantes del Backend, con autorización operativa,
y configurar privadamente los Subjects de Contabilidad e Instalación. La falta de Instalación
bloquea la aprobación con un mensaje claro. Intelligence permanece independiente.

Presupuestos y Jefe Comercial consultan un **Resumen de propuesta** con imágenes, ubicación, sistema, dimensiones en mm, cantidad y superficies en m² con dos decimales. La superficie del ítem ya incluye todas sus unidades; el resumen muestra también superficie por unidad y totales de unidades/superficie. Comercial presenta los precios y el total de su propia versión; Presupuestos indica la ausencia de importes confirmados en su catálogo técnico. La descarga conserva el nombre del documento correspondiente, saneado para guardarlo de forma segura.

La precisión técnica de comparación es 3 decimales en metros para ancho/alto y 6 decimales
en m² para superficie. Las mitades se redondean alejándose de cero. Backend decide las
diferencias; Frontend usa la misma normalización decimal para presentación legible, con coma
decimal y sin ceros finales innecesarios. No modifica valores originales, fórmulas ni dinero;
esta regla no representa una tolerancia de fabricación o instalación. Los editores mantienen
el valor original para evitar guardar redondeos por mera visualización.


## Instalación: toma de medidas

Installation usa la navegación y bandeja existentes; el expediente muestra el checklist cuando
existe TakeMeasurements. Cada unidad física tiene un check independiente y UUID persistido.
El Backend calcula el avance, conserva adiciones/retiros y audita marcas/desmarcados.
La interfaz permite carga múltiple y sustitución documental, confirma retiros y radicación,
y conserva la clave de un comando si su resultado de red es incierto. El reintento envía el mismo
comando/revisión; una sesión desactualizada recibe 409 y debe revisar el estado oficial.
Las cargas reutilizan la clave del lote al reintentar; una selección nueva usa otra clave.
Management consulta sin controles de escritura. El rol activo sigue enviándose al BFF.

La radicación exige estructuras vigentes, todas medidas, y documentos vigentes; congela los datos
y completa la tarea sin SLA. Después se conserva el estado final al recargar. No implementa Acta
de Vanos ni habilita una tarea de Ingeniería. Rutas BFF cerradas bajo
`projects/{id}/measurements`: GET, POST initialize, POST commands y POST documents/batch.
Los documentos no se interpretan automáticamente ni modifican precios o la cotización original.

El retiro abre una confirmación modal centrada que identifica ítem, unidad e ID y recibe el foco.
Cancelar o Escape no envían cambios. Tras confirmar, la unidad sale de las vigentes y permanece
en Estructuras retiradas y en el historial; conteos y progreso se recuperan del Backend.

Las tarjetas de Instalación muestran el dibujo persistido del ítem y ancho/alto de obra
visualmente asociados. Sistema es texto libre; no se solicitan ni muestran notas de estructura.
Los datos cotizados se muestran separados como referencia. Guardar medidas persiste la captura
por unidad mediante RecordActual; no marca automáticamente Medido. Antes de radicar deben
guardarse las tarjetas editadas. Tras radicar, la captura queda en el snapshot y solo se consulta.
El layout muestra tres tarjetas por fila desde 1200 px, dos desde 760 px y una en pantallas menores,
con controles táctiles. Las imágenes usan blobs autenticados compartidos por ítem y se revocan
al desmontar la vista. Las estructuras agregadas o ítems sin imagen muestran su ausencia explícita.

La ficha de Instalación captura manija (mm, sugerencia 1100 sin guardar hasta confirmar), vista,
apertura batiente y lado de bisagras, y alfajía. Izquierda/derecha describe las bisagras desde
la vista seleccionada; cambiar la vista no invierte el sentido. Sistema sigue siendo texto libre.
Los detalles pueden guardarse incompletos; Backend exige completitud al marcar Medido. Los
checks históricos se conservan y no reciben datos técnicos ficticios.

El editor de croquis usa Pointer Events, lienzo 4:3, lápiz/borrador, deshacer/rehacer, limpieza
confirmada, guardado WEBP y cancelación sin escritura. Cada unidad tiene versiones independientes;
los trazos se recuperan del Backend y las vistas previas son blobs autenticados revocados al
salir. Límite 200 trazos/20000 puntos (2000 por trazo), WEBP 1200 × 900 hasta 512 KB. Los comandos
RecordTechnical/RecordSketch conservan revisión e idempotencia del checklist; el BFF permite
solo lecturas de versiones bajo measurements/structures/{id}/sketches/{versionId} y /image.
Retiradas/radicadas no se editan; el snapshot refiere versiones inmutables. No se implementa Ingeniería.

**Milímetros es la unidad de negocio de todas las longitudes de Steel & Glass.** Toda longitud
visible/editable en Instalación está en mm. measurements/units.ts centraliza la conversión de
ancho/alto hacia/desde los contratos heredados en metros (2000 × 2400 mm ↔ 2 × 2,4 m).
El almacenamiento en metros es compatibilidad técnica, no una regla operativa; manija/alfajía
se guardan directamente en mm. Superficies m² y valores monetarios conservan sus unidades.
No hay migración global de unidades ni cambios de contratos en Cotizador, Presupuestos o Comercial.

Cada tarjeta distingue seis secciones: referencia cotizada, medidas en obra, detalles técnicos, croquis, revisión/modificaciones y confirmación. Mantiene tres columnas en escritorio y adaptación a tablet, con controles táctiles y resultados junto a la sección guardada.

Medidas, detalles técnicos y croquis mantienen borradores independientes por estructura. Se pueden
editar en cualquier orden; solo los botones de escritura se serializan mientras hay una petición.
Guardar una sección no envía ni descarta las otras, y los refrescos/conflictos conservan los
borradores y la edición posterior al envío. El editor permite «Volver a ficha · conservar borrador»;
Cancelar croquis descarta únicamente ese borrador. No hay guardado automático ni almacenamiento
local permanente. Al recargar/cerrar el navegador se advierte si quedan cambios sin guardar.
Medido muestra los campos obligatorios pendientes y exige los datos persistidos validados por
Backend; el croquis ausente no lo bloquea si no existe modificación. Cualquier borrador pendiente debe guardarse o descartarse
antes de Medido/radicación. Los checks históricos se conservan; se permite desmarcar sin descartar borradores para corregir
una ficha incompleta. Retirar con borradores requiere
confirmación explícita de su descarte. La altura de manija se valida contra el alto real guardado;
si falta, se indica guardar primero Medidas, sin bloquear la edición de otros campos.


La ficha incluye tipo del par de medidas (acordada/producción/vano), ubicación real y observaciones
opcionales, separados de los valores cotizados. Alfajía permite 114, 160 u Otro; No limpia el valor.
Las estructuras retiradas muestran su responsable y admiten reintegración confirmada antes de
radicar, conservando ID/datos/orden y requiriendo confirmar nuevamente Medido.

Revisar comparación registra una resolución motivada de la Instalación asignada sobre dimensiones
y tipo persistidos. La referencia comercial no se presume equivalente. Solo una resolución
Comparable calcula diferencias absolutas en mm y exige modificación cuando alguna es >100 mm.
NotComparable vigente se muestra como «Referencia no comparable — documentada»; no significa
Sin modificación. La revisión sin resolver se abre directamente. No se infiere equivalencia: el ítem cotizado no conserva un tipo de medida equivalente. Cambios en dimensiones/tipo requieren volver a revisar.

Modificar estructura guarda una versión auditada con tipo, motivo, descripción y selección explícita
del croquis que documenta el cambio. Se permiten borradores, pero Medido requiere la modificación
completa vinculada a la ficha vigente. Las secciones mantienen borradores independientes. El editor
Texto permite insertar, seleccionar, editar, mover mediante nueva posición, eliminar y deshacer/
rehacer anotaciones; el campo aparece sobre el punto tocado y recibe foco, con Enter o Confirmar texto para aplicarlo. Se guardan con coordenadas normalizadas en Drawing v2 y WEBP. V1 sigue legible. El editor se cierra cuando el comando tuvo éxito y se recuperó su versión con imagen; conserva abierto cualquier trazo o texto posterior sin guardar.

La radicación ofrece Descargar reporte PDF de Instalación si existe Snapshot.Report. La descarga
usa GET projects/{id}/measurements/submissions/{submissionId}/report, el BFF cerrado, rol activo,
no-store y attachment. Respeta el nombre seguro del Backend `Radicacion de medidas-[Nombre del proyecto].pdf`, también con guardado nativo disponible. Backend genera y conserva el PDF con el snapshot oficial; no hay captura
HTML ni generación de reportes en el navegador. Expedientes históricos sin reporte no se reconstruyen.
No se crean tareas de Ingeniería. Las migraciones de Backend requieren despliegue coordinado y no
se aplican desde Frontend.


La verificación del anticipo distingue archivos seleccionados (sin guardar), comprobantes guardados y envío confirmado a Contabilidad. El asesor carga, verifica y luego envía; ante rechazo puede sustituir evidencia y reenviar conservando el historial. Un envío pendiente de archivos locales queda deshabilitado. La carga con resultado incierto exige consultar primero los archivos del servidor; no se repite automáticamente. El envío conserva su clave idempotente durante el reintento.

El expediente prioriza anticipo para Asesor/Contabilidad/Gerencia, propuesta técnica para Presupuestos y revisión comercial para Jefe Comercial. Instalación prioriza su tarea y expediente técnico, conservando documentos y responsable comercial como contacto disponible; no se inventan teléfonos o direcciones ausentes del contrato. Actividad/tareas generales y contexto comercial-contable quedan como consulta secundaria desplegable. Gerencia conserva la visión transversal. Esta organización no restringe ni amplía permisos: los endpoints mantienen el ámbito de lectura y las autorizaciones por rol activo, Subject y asignación.
