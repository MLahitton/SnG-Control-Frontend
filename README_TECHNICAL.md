# Manual técnico — SnG Control Frontend

## Stack y herramientas

| Herramienta | Versión instalada |
| --- | --- |
| Node.js | 24.16.0; proyecto compatible con Node 24 |
| pnpm | 11.5.0 |
| Next.js / eslint-config-next | 16.4.0 |
| React / React DOM | 19.3.0 |
| TypeScript | 5.9.3, strict |
| Tailwind CSS / @tailwindcss/postcss | 4.3.3 |
| @react-oauth/google | 0.13.5 |
| server-only | 0.0.1 |
| ESLint | 9.39.5 |
| Vitest | 5.0.4 |
| Testing Library React / jest-dom / user-event | 16.3.3 / 7.0.1 / 14.6.8 |
| jsdom | 30.1.2 |
| @types/node / @types/react / @types/react-dom | 24.19.2 / 19.3.0 / 19.3.0 |

`pnpm-lock.yaml` fija las versiones transitivas. ESLint 9 es la versión compatible con los plugins del preset de Next.js instalado. npm marca esa línea como deprecated; ESLint 10 produce conflictos de peers con esos plugins. Revisar compatibilidad antes de actualizar, sin desactivar reglas ni ignorar los conflictos.

Bootstrap ejecutado desde la raíz vacía:

```powershell
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --disable-git --yes
```

No había `.git` en el directorio inicial. El bootstrap no inicializó Git ni creó commits. No se tocaron otros repositorios.

El bootstrap resolvió las versiones estables indicadas. Se quitaron los SVG, el favicon, las fuentes remotas y el contenido de demostración. Next usa sus defaults estables; `next.config.ts` no habilita opciones experimentales ni opciones explícitas de Turbopack. Tailwind usa PostCSS.

## Comandos

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:run
pnpm build
pnpm start
```

`test` abre modo watch; `test:run` ejecuta una sola vez. `typecheck` ejecuta `next typegen && tsc --noEmit` para incluir las rutas actuales sin compilar producción. `start` requiere un build previo. El lint falla también ante warnings. Los tests no requieren Internet, Google real ni el backend. En entornos Windows restringidos, Vitest y Next necesitan permiso para crear sus procesos de compilación.

Durante desarrollo ejecuta suites focalizadas, por ejemplo `pnpm test:run tests/apiClient.test.ts tests/backendBridge.test.ts`. Ejecuta la suite completa, lint, typecheck y build una vez cuando el cambio esté estable. No reinstales si no cambian dependencias ni lockfile.

## Estructura

```text
src/
  app/
    (app)/
      layout.tsx
      page.tsx
    api/auth/me/route.ts
    api/backend/[...path]/route.ts
    login/page.tsx
    globals.css
    layout.tsx
  features/auth/
    components/
      AuthGate.tsx
      GoogleSignInButton.tsx
      UserIdentityCard.tsx
    context/AuthProvider.tsx
    hooks/useAuth.ts
    hooks/useApiClient.ts
    services/authService.ts
    types/auth.ts
  features/shell/components/
    AppShell.tsx
    Sidebar.tsx
    TopBar.tsx
  lib/api/
    apiClient.ts
    apiError.ts
    backendBridge.ts
    backendPath.ts
    contentDisposition.ts
    types.ts
  lib/config/
    env.ts
    server-env.ts
tests/
  setup.ts
  fixtures.ts
  authService.test.ts
  AuthProvider.test.tsx
  auth-components.test.tsx
  GoogleSignInButton.test.tsx
  route.test.ts
  env.test.ts
  backendBridge.test.ts
  apiClient.test.ts
  api-session.test.tsx
  AppShell.test.tsx
  google-lifecycle.test.tsx
```

La raíz contiene `.gitignore`, `AGENTS.md`, ambos README, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs` y `vitest.config.mts`. Next genera `next-env.d.ts` y `.next/`, ignorados por Git. `AGENTS.md` contiene reglas permanentes y el bloque de Next que remite a su documentación instalada.

App Router define las páginas y los Route Handlers. El layout raíz conserva AuthProvider para toda la aplicación. El grupo `(app)` agrega AppShell/AuthGate a las rutas operativas sin cambiar sus URLs; `/login` queda fuera. La sesión usa APIs del navegador en componentes cliente; no hay middleware ni autenticación SSR con `sessionStorage`. AuthGate controla la presentación: la seguridad de las operaciones continúa en el backend.

## Configuración

La configuración local usa `.env` en la raíz, junto a `package.json`, y está ignorada por Git. Conserva su contenido local: no es necesario recrear `.env.example`. `.env.local` también permanece ignorado.

| Variable | Visibilidad | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Pública, incluida en el bundle | OAuth Client ID de una aplicación web Google |
| `SNG_API_BASE_URL` | Solo servidor | URL absoluta HTTP/HTTPS de SnG-Control-Backend |
| `SNG_INTELLIGENCE_BASE_URL` | Solo servidor | Origen de SnG Intelligence; ejemplo local `http://127.0.0.1:8001` |

La configuración de Intelligence se prepara independientemente en cada worktree; no se copia `.env` ni credenciales. No agregar OPENAI_API_KEY ni modelos de proveedores al frontend. El BFF de Intelligence solo usa su URL server-only; la UI no la recibe.

No hay valores reales ni fallback de backend. El Client ID identifica la aplicación y es público; no es una contraseña. Este flujo NO usa Client Secret. No se debe solicitar, almacenar ni añadir al entorno frontend.

El Client ID se valida antes de montar GoogleOAuthProvider. Si falta, el login queda deshabilitado: desarrollo muestra el nombre de la clave que falta y producción muestra un mensaje seguro. Nunca muestra el valor. Es posible compilar sin configuración, pero el acceso no estará operativo. Define el Client ID antes del build de un entorno utilizable: Next incorpora las variables públicas durante la compilación; cambiarlo exige recompilar o reiniciar dev.

`server-env.ts` importa `server-only` para impedir su uso desde el cliente. Valida `SNG_API_BASE_URL` al solicitar los puentes; rechaza protocolos ajenos a HTTP/HTTPS, credenciales, query y fragmento. Los destinos se construyen desde la raíz del origen configurado, aunque la base tenga un path. Una configuración inválida devuelve 503 seguro.

## Configuración de Google

Usa un OAuth Client ID de tipo aplicación web y registra el origen exacto del frontend en Authorized JavaScript origins, incluyendo esquema y puerto. Para desarrollo con el puerto habitual: `http://localhost:3000`. Si Next elige otro puerto, registra ese origen o libera el puerto esperado.

La audiencia aceptada por el backend debe corresponder al Client ID del frontend. La audiencia y usuarios de prueba de Google deben permitir la cuenta con la que se prueba. No hay filtro de dominio en la aplicación.

Se utiliza `GoogleOAuthProvider` con `GoogleLogin` de `@react-oauth/google`. `onSuccess` recibe `credential`, el Google ID Token, y lo entrega a `signIn`. No se utiliza `useGoogleLogin`, access-token flow, OAuth manual ni `gapi.auth2`. One Tap y selección automática están desactivados. El idioma del botón oficial lo determina Google. Los fallos de carga del SDK y del acceso muestran mensajes accesibles.

### Ciclo de vida GSI en desarrollo

En la versión instalada, `useLoadGsiScript` inserta/retira el script en un efecto y `GoogleLogin` ejecuta `google.accounts.id.initialize()` en otro efecto. Montar nuevamente esos componentes reinicializa GSI; Strict Mode también vuelve a ejecutar efectos en desarrollo.

El login conserva el mismo proveedor y botón durante loading y errores de validación, ocultándolo y marcándolo `inert` cuando no puede usarse. Así evita desmontar/recrear GSI cada vez que se valida una credencial. Un guard evita callbacks duplicados mientras hay un acceso pendiente. El test de ciclo de vida usa la librería instalada y un SDK Google simulado: valida un único script activo y una única inicialización durante un intento fallido, con Strict Mode.

Al salir de la ruta login y volver a entrar, la integración puede inicializar GSI otra vez; Fast Refresh o el ciclo de efectos de desarrollo también pueden producir el aviso. No se desactivó Strict Mode, no se parcheó la librería ni se añadieron scripts manuales. El test no demuestra ausencia de warnings en Google real: esa comprobación requiere el navegador y el SDK reales.

## Sesión y estado

`AuthProvider` mantiene `status` (`loading`, `authenticated`, `unauthenticated`), `user`, `error`, `signIn(idToken)`, `logout()`, `invalidateSession()` y el cliente API asociado a la sesión. `useAuth` expone ese contexto; `useApiClient` devuelve el cliente para los servicios/hooks de negocio.

1. Al montar, lee únicamente `sessionStorage["sng.google.id_token"]`.
2. Sin token: pasa a no autenticado.
3. Con token: llama al servicio y mantiene loading hasta la respuesta.
4. Un 200 con identidad válida activa la sesión.
5. Un 401 limpia token e identidad.
6. Ante fallo temporal, también limpia el token, muestra error y requiere un nuevo acceso. No simula una sesión válida ni reintenta en bucle.

Al iniciar sesión se limpia cualquier token anterior y se valida el nuevo. Solo tras un 200 válido se guarda el token. Si el navegador bloquea el almacenamiento, se muestra un error y no se declara autenticación exitosa.

No se persisten email, name ni subject; se recuperan del backend en cada restauración. No se lee `exp` ni ningún claim del JWT. No hay refresh tokens, cookies de autenticación ni sesión server-side.

Logout aborta validaciones pendientes, borra el token, limpia la identidad y redirige a `/login` sin llamar al backend. Las respuestas tardías de operaciones abortadas no pueden reactivar una sesión. Si el navegador deniega la eliminación del almacenamiento, el estado local se limpia y se muestra un error; no se puede garantizar un borrado que el navegador rechaza. No se revoca ni se cierra globalmente la cuenta Google.

Un 401 del cliente API invoca la invalidación global una sola vez por generación de sesión, incluso con varias solicitudes concurrentes. Lee el token de sessionStorage solo si el proveedor ya validó la sesión. Sin token no hace fetch ni inventa autenticación. Un 401 tardío de una generación anterior no elimina una sesión nueva. Las operaciones de negocio con 403, 409 o errores temporales no cierran la sesión.

`sessionStorage` está asociado a origen y pestaña y sobrevive recargas. La restauración de pestañas por el navegador puede conservarlo y una pestaña duplicada puede obtener una copia inicial. Por ello siempre se revalida. Es una solución de desarrollo accesible a JavaScript; una futura sesión de producción requiere una decisión propia de seguridad.

## Comunicación con el backend

```text
GoogleLogin → credential → AuthProvider.signIn
  → authService.getCurrentUser
  → GET Next.js /api/auth/me
  → GET {SNG_API_BASE_URL}/api/auth/me
  → .NET valida Google → { subject, email, name, roles, isManagement }
```

`authService` centraliza el fetch de mismo origen. Envía `Authorization: Bearer <ID_TOKEN>`, desactiva caché y no envía cookies. Valida el contrato de identidad y convierte errores de red, JSON y status en errores controlados; no muestra el cuerpo de error del backend.

El Route Handler:
- Exige una cabecera Bearer no vacía y con formato de token HTTP; no valida ni decodifica el JWT.
- Reenvía la misma cabecera Authorization exclusivamente al endpoint fijo.
- Usa `cache: "no-store"`, un timeout de 10 segundos y `redirect: "error"` para no seguir redirecciones con credenciales.
- En 200 exige subject no vacío, email/name string o null, roles como array de nombres SystemRole únicos y cerrados e isManagement boolean consistente con roles.Contains(Management). BFF y authService proyectan estos cinco campos; contratos desconocidos no conceden permisos.
- En 401 devuelve 401 y un mensaje seguro.
- Conserva status 400–599 con JSON controlado. Respuestas inesperadas, JSON inválido, error de red, timeout o TLS producen 502.
- Nunca devuelve URL interna, cabeceras del backend, tokens, claims extra ni detalles técnicos. Las respuestas llevan `Cache-Control: no-store` y `Vary: Authorization`.

Este puente específico se mantiene para validar identidad. El navegador solo llama a Next.js; no necesita CORS de .NET para estos flujos. No se modificó el backend.

### BFF de negocio controlado

`/api/backend/[...path]` delega en `backendBridge.ts` y apunta exclusivamente a `{SNG_API_BASE_URL}/api/...`.

- Raíces operativas permitidas: `clients`, `projects`, `project-tasks`, `notifications`. Para Gerencia solo se aceptan las rutas exactas `management/overview` y `management/tasks`, exclusivamente mediante GET; otros métodos devuelven 405 con Allow: GET. No se permite la raíz management genérica ni subrutas adicionales. No hay URLs/hosts/protocolos controlados por el browser.
- Métodos reenviados: GET, POST y PUT; DELETE únicamente en `projects/{projectId}/documents/{documentId}`, validando los segmentos existentes y rechazando payloads. DELETE en cualquier otra estructura devuelve 405. PATCH no se exporta; HEAD responde 405 explícitamente para evitar el GET automático de Next. OPTIONS puede responder localmente por Next, sin llegar al backend.
- Segmentos: letras ASCII, números, guiones/guiones bajos y puntos internos entre partes válidas (por ejemplo `confirmed.xlsx`). Rechaza vacíos, puntos solos, barras, backslashes, porcentajes/doble encoding, espacios, query/fragmentos dentro del path y demás caracteres anómalos. Máximo 20 segmentos de 200 caracteres.
- Usa URL APIs y conserva el querystring, incluidos parámetros repetidos. Ningún query puede cambiar el origen o la ruta construida.
- Reenvía solo Authorization, Accept y Content-Type permitido en POST/PUT cuando está presente. No Cookie, Host, Connection, Referer, Origin ni cabeceras arbitrarias. No inventa Content-Type ni body para operaciones vacías; reconoce streams vacíos de Next sin Content-Type y rechaza bytes reales sin media type.
- Acepta JSON, media types JSON, multipart con boundary, XLSX y octet-stream. El body se reenvía como stream con `duplex: "half"` sin leer/reconstruir FormData ni transformar archivos. POST/PUT sin body también funcionan.
- Fetch con `cache: "no-store"`, `redirect: "error"` y cancelación del request. Timeout normal: 120 segundos. Solo POST `projects/{id}/documents/batch` y GET `projects/{id}/documents/{documentId}/file`, `current.zip`, `initial-handoff.zip` usan 600 segundos (10 minutos). No reintenta mutaciones automáticamente.
- Conserva status 2xx y 4xx/5xx, incluidos 201, 204, 401, 403, 409 y 413. Redirects inesperados o respuestas no admitidas producen 502. Configuración ausente/inválida produce 503; red/TLS/timeout antes de responder produce 502.
- Todas las respuestas llevan `Cache-Control: no-store` y `Vary: Authorization`. Se permiten Content-Type, Content-Disposition validado y Retry-After numérico o fecha HTTP. Se descartan cookies, Location y headers internos.
- JSON exitoso conserva datos de negocio, eliminando claves de diagnóstico/credenciales y anulando referencias al origen interno, al Bearer recibido o a paths de almacenamiento reconocibles. Descargas XLSX/octet-stream/ZIP se transmiten sin modificar bytes; su contenido documental es responsabilidad del backend. En GET documental individual, cualquier archivo (incluido HTML/SVG/JSON) es opaco: se fuerza `application/octet-stream`, `Content-Disposition: attachment` y `nosniff`, conservando el filename validado. ZIP conserva `application/zip` y también se fuerza como descarga.
- Los binarios se transmiten en streaming: una interrupción posterior a enviar las cabeceras aborta la descarga; el cliente la trata como error seguro. No es posible sustituir el status por 502 después de enviar esas cabeceras.

### Cliente API y errores

`useApiClient()` obtiene la instancia creada por AuthProvider. Sus métodos son `get<T>`, `post<T>`, `put<T>`, `delete<T = void>`, `upload<T>`, `download`, `downloadStream` y `postAudio` (solo speech de Intelligence). El path es relativo al BFF (ejemplo: `projects`), sin slash inicial ni query embebido; las opciones aceptan `URLSearchParams` y `AbortSignal`. Los genéricos representan el contrato esperado; cada futuro servicio debe validar su contrato si requiere validación runtime.

El cliente agrega Bearer, omite cookies, no cachea ni sigue redirects. JSON se serializa centralmente. Para FormData no establece Content-Type: el navegador crea el boundary y el BFF lo conserva. Un 204/205 permite resultados `void`.

`download` retorna `{ blob, filename }` y nunca activa una descarga automáticamente. Lee `filename` o `filename*=UTF-8''...` de Content-Disposition, valida que sea un nombre simple (sin paths ni nombres reservados de Windows) y devuelve null si no es seguro o falta. Nunca toma el nombre de un querystring.

`downloadStream` retorna `{ stream, filename }` sin consumir el body y usa el mismo flujo autenticado/error/401. Ambas modalidades aceptan ZIP. `saveDownload` se llama desde el gesto del usuario: si existe `showSaveFilePicker`, solicita primero un destino con suggestedName seguro de la UI y luego conecta el stream autenticado al writable con `pipeTo`. El nombre elegido en el selector pertenece al usuario. Sin esa API, consume un Blob en el browser y usa un enlace con `download`, filename seguro del backend o fallback validado, retirando el enlace y revocando su object URL. Cancelar el selector no llama a la API ni muestra un error de servidor. No hay preview, iframe o almacenamiento de archivos en sessionStorage/localStorage.

`ApiError` expone status, message, code opcional y ProblemDetails seguros. Los mensajes son locales por status: 403 indica “No tienes permiso para esta acción”; 409 conserva el código de negocio sin imponer lógica de UI.

La allowlist de extensiones acepta `code`, `errorCode`, `field`, `fields` (identificadores acotados) y `retryAfterSeconds` (entero no negativo), tanto en la raíz de ProblemDetails como dentro de `extensions`. Se conservan en 4xx; los 5xx usan diagnóstico genérico salvo el identificador exacto `code: DocumentUnavailable` en status 500, necesario para el mensaje documental local. Esa excepción no conserva ninguna otra extensión. Se descartan title/detail/type/instance libres, stack traces, paths y extensiones desconocidas. Agrega extensiones solo al confirmar un contrato seguro del backend; no expongas indiscriminadamente ProblemDetails.

También acepta `missingItems` y `unexpectedItems` como arrays de `CommercialItemKey`: únicamente `section: "Main" | "Additional"` y `sourceRow` entero seguro positivo. Cada array admite hasta **200 elementos**, incluidos arrays vacíos. Si supera el límite o contiene algún elemento inválido se descarta ese array completo, sin truncarlo; los campos adicionales de los objetos se eliminan. `fileError` acepta solo un identificador ASCII de 1–80 caracteres, iniciado por una letra y seguido de letras, números o guiones bajos. No admite texto libre, URLs ni paths.

Estos tres campos admiten entrada en la raíz o en `extensions`, con la misma precedencia existente: raíz no nula primero. La salida canónica está en `problem.extensions`; `ApiError` además expone propiedades tipadas `missingItems`, `unexpectedItems` y `fileError`. No se permite ningún objeto o extensión arbitrarios.

Los servicios en `features/clients`, `features/projects`, `features/documents`, `features/tasks` y `features/notifications` utilizan esta capa con contratos explícitos. Las pantallas obtienen `useApiClient()` y gestionan su estado de envío sin duplicar fetch ni invalidación de sesión.

### Flujo operativo de Frontend 2B

Las rutas `/clients`, `/projects`, `/projects/new`, `/projects/[id]`, `/tasks` y `/notifications` pertenecen al grupo protegido `(app)`. La página dinámica espera `params` de Next y entrega el identificador al componente cliente. No hay nuevas dependencias ni almacenamiento global de entidades.

| Operación | Endpoint backend (vía BFF) |
| --- | --- |
| Lista/creación de clientes | GET/POST `clients` |
| Cliente del proyecto | GET `clients/{id}` |
| Lista/creación de proyectos | GET/POST `projects` |
| Detalle | GET `projects/{id}` |
| Tareas del proyecto | GET `projects/{id}/tasks` |
| Historial de notificaciones | GET `projects/{id}/notifications` |
| Envío a Presupuestos | POST `projects/{id}/send-to-budgets`, sin body |
| Asignación/corrección SG | PUT `projects/{id}/sg-code`, `{ sgCode }` |
| Preview técnico Presupuestos | POST `projects/{id}/budget-quotation/preview`, multipart `file` |
| Confirmación inicial Presupuestos | POST `projects/{id}/budget-quotation/confirm`, multipart `file` + `confirmation` |
| Estado persistente de cotización | GET `projects/{id}/budget-quotation/status`, sin body |
| Envío a Comercial | POST `projects/{id}/send-to-commercial`, sin body |
| Excel operativo Comercial | GET `projects/{id}/budget-quotation/commercial-file` |
| Preview Comercial | POST `projects/{id}/commercial-quotation/preview`, multipart solo `file` |
| Confirmación Comercial | POST `projects/{id}/commercial-quotation/confirm`, multipart solo `file` |
| Excel comercial final | GET `projects/{id}/commercial-quotation/file` |
| Bandeja personal del rol activo | GET `project-tasks?area={area}&status={status}` |
| Notificaciones personales | GET `notifications`, sin query params |

Crear cliente envía solo `{ name }`; crear proyecto envía `{ clientId, name, city, productLine }`. Los nombres duplicados no se bloquean. La línea acepta Classic, Essential, Bioconfort o Signature. El selector exige un cliente existente; sin clientes ofrece ir a `/clients`. El backend determina `createdBy`; la UI muestra su nombre/email como responsable comercial y no pide ni presenta Subjects en estas pantallas.

El detalle consulta proyecto, cliente, tareas y notificaciones; documentos tiene una consulta y estados independientes. Solo ofrece enviar a Presupuestos tras cargar correctamente documentos y recibir `canSendToBudgets=true`, con confirmación explícita. Al recibir éxito incorpora la tarea y refresca documentos/tareas/notificaciones. El envío crea Pending/NotStarted, con inicio y vencimiento nulos: no inicia el plazo de cinco días. Un 409 `DocumentsRequired` muestra la indicación de cargar al menos un documento y refresca documentos/tareas, sin simular éxito.

La gestión visual de SG exige Budgets activo y user.subject igual a prepareQuotation.assignedToGoogleSubject. La primera asignación requiere Pending y SG nulo; corregir requiere InProgress y SG existente. Backend valida membresía, área activa, tarea asignada y workflow. Ningún rol obtiene esos controles por compartir Subject con el creador.

Se aplica trim + uppercase y `/^SG[0-9]+$/`, sin conversión numérica ni pérdida de ceros iniciales. La respuesta `{ project, prepareQuotationTask }` actualiza ambas entidades y se refrescan notificaciones. Inicio, vencimiento, estado y evidencia de atraso proceden del backend; corregir SG no calcula fechas ni crea tareas.

Todas las mutaciones tienen bloqueo síncrono contra doble submit y controles deshabilitados durante el envío; no hay retries automáticos. Un 409 de SG/envío a Presupuestos refresca el detalle. Para SG, el mensaje contempla código en uso o estado incompatible sin afirmar una causa; conserva el business code si existe. Si la mutación ya se guardó y falla una consulta relacionada, la UI conserva el éxito y permite repetir únicamente las lecturas.

### Presupuestos 4C — cotización técnica XLSX

`features/budgetQuotation` separa tipos, parser cerrado, service, validación y componentes de panel/preview/editor. `ProjectDetailPage` monta el panel con PrepareQuotation InProgress o Completed y coincidencia `user.subject === assignedToGoogleSubject`; backend sigue autorizando con BudgetsAssignee. El editor 4C requiere InProgress, SG existente y status NotConfirmed. El panel ocupa el ancho del expediente entre acciones y actividad/tareas, con cards y grids adaptables.

`budgetQuotationService` usa `api.upload` con AbortSignal y rutas del BFF existente. Preview envía exactamente `file`; confirm envía exactamente `file` y `confirmation`, Blob `application/json; charset=utf-8`. El navegador genera el boundary. El BFF pasa el stream original sin leer/reconstruir multipart/XLSX; mantiene origen fijo server-only, cabeceras permitidas, no-store y sanitización. El subpath budget-quotation admite POST preview/confirm y GET status/commercial-file; send-to-commercial admite solo POST sin payload, incluidos streams técnicamente presentes pero vacíos. Se rechazan métodos/subrutas adicionales sin ampliar documentos ni otras rutas.

Los parsers rechazan claves desconocidas, tipos/nulabilidad incorrectos, números no finitos/no positivos, cantidades fraccionarias, identidades duplicadas y respuestas de otro proyecto. El preview conserva metadata documental, orden de ítems, Main/Additional, imágenes y warnings. Se admiten data URLs únicamente de PNG, JPEG, GIF, BMP y TIFF con base64 válido; SVG/HTML y otros MIME rechazan el contrato. La disponibilidad de decodificación de TIFF depende del navegador. MissingImage/AmbiguousImage se muestran sin bloquear confirmación. La respuesta confirmada trae `image: {status, contentType}`, no los bytes del preview.

El draft contiene once campos: ItemNumber, Location, System, Glass, AluminumFinish, LockType, Observations, Width, Height, SquareMeters, Quantity. Se hace trim exterior, número obligatorio, medidas > 0 y cantidad entera > 0. Section/SourceRow se reconstruyen exclusivamente del preview, uno por ítem y sin altas/bajas. No se recalculan m² ni totales. La confirmación usa el mismo File guardado junto al preview, nunca el estado separado del selector.

Archivo, preview y draft viven solo en React. Cambiar archivo invalida todo; cambiar SG remonta el panel. ProjectDetail sigue remount por proyecto + Subject, abortando solicitudes y descartando respuestas tardías; no hay storage/cache persistente ni parseo XLSX frontend. Los locks síncronos evitan doble preview/confirm y los controles bloquean archivo, SG y operaciones documentales durante la solicitud. Un error conserva el preview para revisión, sin éxito optimista ni retry automático.

El éxito usa `prepareQuotationTask` devuelto por backend, sin calcular fechas. La comparación extracted/confirmed cuenta solo ítems realmente ajustados. Confirmar **NO completa PrepareQuotation**; continúa InProgress hasta el handoff comercial. El feedback de confirmación es inmediato y converge con GET status; el editor se desmonta y no conserva la respuesta completa como fuente de estado persistente.

### Presupuestos 4D — estado persistente y handoff

`BudgetQuotationPanel` consulta GET status al abrir/reabrir el proyecto. El parser cerrado valida las once propiedades: projectId, status, versionNumber nullable, confirmedAt nullable, itemCount, totalQuantity, documentSgCode nullable, currentProjectSgCode nullable, canSendToCommercial y sendBlockReason. Estados string exactos: NotConfirmed, Confirmed, SentToCommercial. Razones string: None, SgChangedAfterConfirmation, InvalidState. No se aceptan enums numéricos, extensiones, tipos corruptos ni respuestas de otro proyecto.

NotConfirmed permite montar `BudgetQuotationEditor` con las condiciones de 4C. Confirmed recupera metadata persistida y oculta upload/preview/editor. El botón de envío depende exclusivamente de `canSendToCommercial`; no se reconstruye la regla desde SG o tareas. SgChangedAfterConfirmation muestra ambos SG sin reparación automática; InvalidState no adivina la causa. SentToCommercial conserva el resumen aun con PrepareQuotation Completed; si ReviewQuotation ya está Completed no se afirma que continúe en revisión.

Enviar abre confirmación inline accesible. Solo Confirmar envío llama `api.post(..., undefined, {signal})`: sin JSON, FormData ni Content-Type inventados. El parser valida la respuesta oficial y sus tareas. Estas actualizan inmediatamente el expediente; GET status, tareas y notificaciones convergen después con backend. Un fallo de refresco conserva el éxito del POST y permite reintentar solo lecturas. Los 409 AlreadySent, InvalidState, SgChangedAfterConfirmation, DocumentMismatch y DocumentUnavailable tienen mensajes seguros y refrescan status/tareas/actividad. Los locks y aborts protegen doble submit, SG/documentos concurrentes, desmontaje y cambio de identidad/proyecto.

El estado recuperado sobrevive F5 porque procede de PostgreSQL a través del read model, no de flags persistidos/localStorage/sessionStorage. El GET no devuelve bytes, imágenes, storage keys ni extracción completa; el backend comparte la validación con el comando y este revalida bajo bloqueo. Gerencia no obtiene nuevos permisos y SnG Intelligence no consume este endpoint. La revisión Comercial se integra en el bloque 4E descrito abajo.

Los códigos UnreadableWorkbook, UnsupportedWorkbookFormat, InvalidDocumentSgCode y TechnicalLimitExceeded conservan el sanitizer existente y tienen mensajes españoles. El backend actual devuelve ciertos 400/409 sin code; `budgetQuotationProblem` traduce exclusivamente títulos exactos conocidos en estos dos endpoints a InvalidConfirmation, AlreadyConfirmed, SgCodeMismatch o InvalidWorkflowState antes del sanitizer. No preserva texto libre ni extensiones desconocidas. 401 invalida sesión; 403 conserva sesión; 404, 413, red y 5xx muestran mensajes seguros. La sanitización del frontend no altera las reglas del backend.

`useResource` mantiene estado local de consulta, cancela lecturas al desmontar/cambiar filtros y descarta respuestas tardías. Presenta carga/error/vacío y permite recarga explícita tras fallos. No es una caché global. La bandeja exige área y estado en cada solicitud. features/tasks/inbox.ts centraliza área fija/default/label/vacío por rol: Budgets → Budgets/Pending; Head y Advisor → Commercial/InProgress. Backend determina el tipo y assignee: PrepareQuotation, ReviewQuotation y PresentQuotationToClient respectivamente. TasksPage elimina el selector Área y mantiene Estado. El contenido se remonta por Subject/ActiveRole, restablece el default y cancela las peticiones anteriores. Management no monta consultas operacionales y ofrece un enlace a /management/tasks; el Backend devuelve 403 si se invoca /project-tasks bajo Management o con área incompatible. Resuelve nombres con un único GET `projects` por montaje, sin consultas por tarea ni nuevas lecturas de proyectos al cambiar filtros.

`TaskList` y `TaskTimingStatus` presentan los tipos/estados y `leadTimeStatus` del backend en español. `formatDate` usa `Intl.DateTimeFormat` con **America/Bogota**, incluyendo hora para vencimientos. No compara deadlines con el reloj ni reconstruye días hábiles. Cuando PrepareQuotation está NotStarted sin deadline, indica que el plazo comienza al asignar SG.

`NotificationList` conserva Informational, Active y Resolved. Resalta Overdue Active y mantiene Overdue Resolved como historial. Muestra título, mensaje, tipo de tarea, fechas y estado; las personales enlazan al proyecto. No muestra recipientGoogleSubject ni incorpora leído/no leído, contadores o acciones de mutación.

### Vistas persistentes de cotizaciones

`features/quotationViews` contiene contratos/parsers cerrados, quotationViewService, BudgetQuotationReadView y CommercialQuotationReadView. El API client y el BFF conservan Authorization, X-SnG-Active-Role, origen fijo y no-store. Se añaden exclusivamente GET:

| Ruta Backend | Uso |
| --- | --- |
| `/api/projects/{id}/budget-quotation/view` | Snapshot técnico confirmado y metadata histórica |
| `/api/projects/{id}/commercial-quotation/view` | Snapshot comercial con precios, total y diferencias |
| `/api/projects/{id}/budget-quotation/items/{itemId}/image` | Raster histórico por proyecto/ítem autorizado |

Budget read model: projectId, quotationVersionId, versionNumber, confirmedAt, document e items con id, section/sourceRow, confirmed, extracted nullable, imageStatus nullable, hasImage y technicalDifferences. Commercial read model: projectId, commercialQuotationId, confirmedAt, projectTotal e items con valores técnicos, precios, diferencias, imageStatus y hasImage (imagen histórica reutilizada por commercialCatalogItemId). Se valida identidad del proyecto, enums, campos, fechas, unicidad estructural y números; no se compara ni calcula economía/diferencias en Frontend. Las diferencias vienen de CommercialTechnicalDifferences en Backend.

ProjectDetail monta el snapshot de Presupuestos antes de la acción Comercial. Para Budgets, BudgetQuotationPanel conserva status/handoff e incluye BudgetQuotationReadView después de confirmar; el editor sigue limitado a NotConfirmed. Después de confirmar Comercial, CommercialQuotationReadView coexiste con la vista histórica de Presupuestos y el panel completado conserva su descarga sin editor. Advisor propietario y Management pueden consultar ambas; Budgets solo la de Presupuestos. Head requiere su ReviewQuotation asignada. El asesor conserva acceso a la descarga final; no se amplían las descargas a Gerencia.

Cada confirmación vuelve a consultar los read models. El remount por proyecto/Subject/área y los AbortSignals descartan datos tardíos. F5 o nueva sesión recuperan todo desde Backend. No se almacenan snapshots en sessionStorage ni HTML/JSON de previews. Un 404 oculta la vista, 403 conserva la sesión y muestra error, y otros fallos permiten reintentar únicamente GET.

Las imágenes se obtienen al pulsar Ver imagen mediante api.download autenticado. Solo PNG/JPEG/GIF/BMP/TIFF; el BFF rechaza SVG, HTML y JSON en esa ruta, exige IDs GUID y transmite bytes sin transformar. El blob URL es local, se revoca al desmontar, y no pasa por Next Image ni expone una clave de storage. TIFF depende del soporte del navegador. Nunca se descargan XLSX para pintar las vistas.

Los ítems usan cards con campos en grid de tres columnas; a menos de 768 px pasan a dos y a menos de 480 px a una, con texto largo ajustable e imagen limitada al ancho. Mantienen headings, labels y controles de teclado. La inspección visual real a 375/768/1024 px y desktop está pendiente: Computer Use detuvo la inspección al no poder determinar con seguridad la URL actual de Opera en Windows.

Smoke manual con una cuenta multirol y un proyecto sintético:

1. Advisor crea proyecto, carga documento y envía a Presupuestos.
2. Cambiar a Budgets sin logout; asignar SG, subir XLSX, preview y confirmar. F5 debe conservar todos los ítems/metadata, sin editor; abrir una imagen y revisar ajustes extraído/confirmado.
3. Enviar a Comercial y cambiar a CommercialHead. El mismo proyecto debe mostrar Presupuestos read-only, sin SG/editor/envío de Budgets, seguido de la revisión Comercial.
4. Descargar archivo operativo, subir el comercial, preview y confirmar. F5 debe mostrar ambos snapshots, precios, total y diferencias, sin preview/editor comercial.
5. Cambiar a Advisor y abrir el mismo proyecto: ambas vistas y PresentQuotationToClient actual; descarga final disponible. Cambiar a Management: ambas vistas sin escrituras. Volver a Budgets: solo snapshot de Presupuestos.
6. Repetir navegación/restauración y revisar 375/768/1024 px/desktop, textos largos, imágenes, foco y ausencia de overflow. No cambiar Secrets ni filas de PostgreSQL manualmente, ni volver a subir archivos para recuperar vistas.

### Comercial 4E — revisión de cotización

`features/commercialQuotation` contiene tipos, parser cerrado, service, mensajes seguros, `CommercialQuotationPanel`, preview de solo lectura y estilos responsive. Se monta en el expediente después de Presupuestos y antes de actividad/tareas, únicamente con CommercialHead activo y el Subject asignado a ReviewQuotation InProgress/Completed. La tarea InProgress permite actuar; Completed muestra estado y descarga final. No se infieren roles por email, nombre, creador o isManagement.

Auditoría backend: preview/confirm y archivo operativo requieren CommercialHead; el archivo final permite Head activo asignado o Advisor activo propietario, sin ampliar el panel al asesor. El multipart acepta únicamente `file`; backend valida SG, estructura exacta Section + SourceRow, workbook y economía. La confirmación reinterpreta el XLSX, conserva sus bytes como archivo final y completa ReviewQuotation/inicia PresentQuotationToClient para el creador original. No hubo cambios backend para 4E.

El parser valida projectId, claves exactas, enums, nulabilidad, números finitos, importes no negativos, medidas positivas y cantidad entera. El preview conserva orden, sección, sourceRow, commercialCatalogItemId, los once valores técnicos, unitPrice, totalPrice y technicalDifferences. Las diferencias solo admiten los once TechnicalField oficiales y strings previousValue/currentValue; su conteo se verifica contra el resumen recibido. No hay comparación técnica local ni cálculo económico. El formato COP conserva los dígitos significativos del número JSON recibido, sin redondearlo a dos decimales. Los contratos JSON actuales usan números JavaScript, no strings de decimal arbitrario.

Archivo y preview forman un snapshot `{file, data}` en React. Confirmar requiere el mismo objeto File y un paso humano inline; el multipart contiene solo `file`, sin precios, IDs ni correcciones declaradas por frontend. Los locks bloquean doble preview/confirm y operaciones incompatibles; cambiar archivo invalida preview/errores/prompt. El remount proyecto + Subject aborta solicitudes, descarta resultados tardíos y elimina el estado efímero, sin almacenamiento persistente de XLSX ni contenido comercial.

La respuesta cerrada de confirmación aporta projectId, commercialQuotationId, projectTotal, commercialFileAvailable, reviewTask, presentQuotationToClientTask, hasTechnicalDifferences y technicalDifferencesCount. Actualiza inmediatamente las tareas oficiales y después relee tareas/notificaciones. Si la actualización falla, conserva el éxito del comando y permite reintentar solo lecturas. F5 reconstruye Completed desde tareas, sin reabrir editor. La vista persistente consulta GET commercial-quotation/view para recuperar valores finales y diferencias después de F5; no los conserva en storage ni reconstruye desde un preview.

El BFF limita estos subpaths a los cuatro métodos/rutas de la tabla. Conserva origen fijo server-only, Authorization permitido, redirect:error, no-store, boundary y stream multipart intactos. Las descargas usan `api.downloadStream` y `saveDownload`: escritura por stream donde existe selector nativo; fallback Blob del mecanismo existente, con Content-Disposition seguro. No se regenera, previsualiza ni interpreta XLSX. El selector nativo respeta la elección de nombre del usuario; el fallback usa el nombre backend.

Se mapean ProjectNotFound, Forbidden, InvalidWorkflowState, AlreadyConfirmed, ProjectCreatorUnavailable, DocumentUnavailable, SgCodeMismatch, StructuralMismatch, InvalidWorkbook e InvalidEconomics, además de InvalidState del archivo operativo. StructuralMismatch muestra solo claves de filas sanitizadas; no reconcilia por número de ítem u orden. AlreadyConfirmed bloquea otro envío y refresca tareas. 401 invalida sesión, 403 mantiene sesión y los demás errores conservan sanitización central, sin paths, tokens, stacks ni origen backend.

4E termina al iniciar PresentQuotationToClient. Deuda funcional: cliente solicita cambios → Comercial registra → Presupuestos → notificación al Jefe Comercial → nueva cotización/revisión/presentación. Este ciclo V2 no está implementado; se conserva el modelo V1 de primera cotización/primera confirmación. Intelligence permanece fuera de este flujo.

### Gerencia — Frontend 3A

`features/management` contiene contratos, service, protección visual y las dos páginas. `ManagementOverview` reproduce totalProjects, tasks, leadTime, areas y attention (total y hasta diez items). `ManagementTask` conserva datos de proyecto/cliente/SG/ciudad/línea, área, type string, status, assignedAt requerido, startedAt/completedAt/deadlineAt nullable, wasOverdue boolean nullable y leadTimeStatus. Reutiliza TaskArea, TaskStatus, LeadTimeStatus, labels/badges y formatDate en America/Bogota; tipos futuros de tarea muestran “Otra tarea”. No calcula plazos ni prioridad.

Management valida en runtime el contrato cerrado de overview/tasks: `leadTime` y `leadTimeStatus` en camelCase. Un payload incompatible produce un error controlado; no se aceptan aliases ni se recalculan estados o plazos.

| Ruta frontend | Endpoint backend mediante ApiClient/BFF | Presentación |
| --- | --- | --- |
| `/management` | GET `/api/management/overview` | KPIs, trabajo por estado, comparación por área y atención |
| `/management/tasks` | GET `/api/management/tasks` | Operación actual e histórica, conservando orden del backend |

La suma de tareas activas es pending + inProgress y se explica en pantalla. Attention conserva el orden recibido, muestra la cantidad visible frente al total cuando está truncada y enlaza a operación/proyectos. Los estados vacíos no inventan áreas ni tareas. La tabla de operación filtra localmente por área, estado y los ocho estados temporales; busca sin distinguir mayúsculas en proyecto, cliente, SG y ciudad. No agrega query params, requests ni debounce por filtros y permite restablecerlos.

`ManagementAccess` exige sesión autenticada, membresía Management y activeRole Management antes de montar o consultar. Subject/área son parte de la key; cambiar área desmonta recursos. useResource aborta y descarta respuestas tardías. 401 invalida sesión; 403 muestra acceso denegado sin logout; no hay caché global gerencial.

features/shell/navigation.ts centraliza navigationByRole y capabilitiesByRole con claves AvailableRole. Sidebar e Inicio usan la misma configuración y comprueban membresía. Los roles operativos tienen Inicio/Clientes/Proyectos/Tareas/Notificaciones; Management tiene Resumen/Operación/Clientes/Proyectos y conserva Intelligence. Se marca únicamente el enlace más específico. Menú móvil, foco y skip-link se mantienen. KPIs y filtros se reorganizan mediante grid; atención pasa de una a dos columnas. Las tablas conservan scroll horizontal explícito y enfocable en pantallas pequeñas.

ProjectDetail exige área activa más assignee/estado para SG y cotizaciones; documentos combinan capabilities oficiales con Advisor activo propietario. Head/Management/Budgets no reciben escrituras documentales aunque compartan Subject con el creador. Enviar a Presupuestos es exclusivo del Advisor activo propietario. Ningún cambio de área modifica CreatedBy o asignaciones.

Crear clientes/proyectos exige CommercialAdvisor activo, incluyendo /projects/new. Backend aplica la política CommercialAdvisor como barrera real; UI solo presenta la experiencia autorizada. Clientes/proyectos remontan al cambiar Subject/área y vuelven a consultar.

Intelligence tiene su bloque separado descrito a continuación. Presupuestos incluye confirmación inicial, recuperación persistente y envío a Comercial. La revisión Comercial 4E completa el handoff al asesor; presentación al cliente, aprobación y pago siguen pendientes.

### Intelligence 1C: arquitectura, contratos y voz

La feature src/features/intelligence mantiene sus contratos, lifecycle y renderer. AppShell monta IntelligenceLauncher solo con Management disponible y activo. Cambiar área o Subject, logout o retirar membresía desmonta panel y voz, sin archivar la conversación durable. Cleanup de Live usa forCurrentSession con token/rol originales para cerrar best-effort, sin contaminar el área nueva.

El ApiClient reconoce ocho combinaciones ruta/método del namespace `intelligence/`, sin query; las dirige a `/api/intelligence/...`. Conserva generación de sesión y protección frente a 401 tardíos. `postAudio` añade POST binario solo para speech, acepta MP3 y reutiliza el mismo Bearer. AuthProvider delega esos métodos en su instancia estable. No hay fetch en componentes ni lectura de tokens en la feature. `forCurrentSession()` captura la identidad de transporte en memoria al iniciar Live: permite cerrar con el Bearer original incluso durante logout/cambio de cuenta, sin usar el token de la siguiente cuenta ni invalidarla por un 401 tardío. La instancia se limita al ciclo de vida Live.

| Método | Ruta same-origin y upstream | Contrato |
| --- | --- | --- |
| GET | `/api/intelligence/session` | `{ authenticated: true, isManagement: true }` |
| POST | `/api/intelligence/chat` | `{ message }` → IntelligenceResponse |
| POST | `/api/intelligence/voice/transcribe` | multipart `file` → `{ transcript }` (service disponible, no flujo separado en UI) |
| POST | `/api/intelligence/voice` | multipart `file` → IntelligenceResponse + transcript |
| POST | `/api/intelligence/voice/speech` | `{ text: spokenAnswer, responseType }` → audio/mpeg |
| POST | `/api/intelligence/live/session` | `{ sdp }` → 201 `{ sessionId, sdp }` |
| POST | `/api/intelligence/live/delegate` | `{ sessionId, callId, question }` → IntelligenceResponse |
| POST | `/api/intelligence/live/close` | `{ sessionId }` → `{ closed: true }` |

El Route Handler dedicado delega en `server/bridge.ts`, marcado server-only. Construye el destino desde `SNG_INTELLIGENCE_BASE_URL`, que debe ser un origen HTTP/HTTPS sin path, credenciales, query ni fragmento; configuración inválida/ausente produce 503. No expone health. Rechaza rutas adicionales, traversal, barras embebidas, query y métodos incorrectos; HEAD no cae en GET automático. Reenvía solo Authorization y Content-Type validado, con Accept definido por operación. Usa no-store, redirect:error, signal combinado con timeout de 180 segundos y no hace retries automáticos.

Chat/speech aceptan application/json; voice/transcribe exigen multipart con boundary. Los bytes JSON/multipart se transmiten sin reconstrucción, con duplex:half. Los tamaños declarados se limitan a 64 KiB JSON o 10 MiB + 64 KiB multipart; el control definitivo de uploads sin Content-Length es el de Intelligence. MP3 se devuelve en streaming, sin buffer del BFF. El navegador crea un Blob temporal para reproducción (máximo aceptado 10 MiB) y revoca su URL al terminar, detener, reemplazar audio o desmontar.

Las respuestas JSON se leen con límite de 512 KiB y pasan por una allowlist de campos tipados. Arrays limitados a 50, IDs UUID, métricas enteras seguras, textos de presentación acotados a 500 caracteres, answer/spokenAnswer a 12000 y transcript a 4000. Campos desconocidos se eliminan; tipos, IDs o discriminadores inválidos producen 502. Se rechazan credenciales/origen interno/paths reconocibles en campos admitidos. Errores solo conservan status y requestId UUID seguro; no se exponen error codes del proveedor, stack, detalles de validación ni headers internos. TLS no se debilita. HTTP loopback es opción local; despliegue puede usar HTTPS.

Contrato observado mediante lectura de `app/contracts/presentation.py`, `app/agent/contracts.py`, `app/agent/presentation.py`, `app/voice/contracts.py` y rutas de SnG Intelligence durante esta implementación:
- Base: responseType, answer, spokenAnswer, references, presentation. presentation.kind debe coincidir con responseType.
- direct: metric nullable; management_brief: metrics/items; project_status: project/tasks; list: items; comparison: areas; clarification: candidates; unavailable: reason=data_not_available.
- ProjectItem: kind/projectId/projectName/sgCode/clientName/city. TaskItem: kind/projectId/projectName/sgCode/taskId/area/task/status/leadTimeStatus/deadlineAt.
- Las etiquetas de área, tarea, estado y plazo en presentation **ya están localizadas por Intelligence**; se muestran literalmente como texto validado, sin tratarlas como enums de Control.
- References project/task contienen IDs UUID y label; solo se generan rutas locales `/projects/{projectId}`. No se aceptan href del modelo. Project name/label es principal y SG secundario. Clarification envía el nombre oficial del proyecto en una nueva consulta autocontenida, sin depender de memoria backend.
- El renderer central usa siete variantes, texto React sin HTML/Markdown ejecutable, cifras solo recibidas y formatDate de Colombia. Unavailable no se trata como fallo.
- Contrato en evolución: si Presentation & Voice 1B cambia, sincronizar types/parser/renderer. No hay fallback que adivine un contrato antiguo. El contrato actual limita speech a 4000 caracteres aunque la base permite spokenAnswer hasta 12000; si excede 4000, se informa input inválido sin truncar ni reinterpretar el texto.

`useVoiceRecorder` solicita getUserMedia solo por gesto, selecciona isTypeSupported (WebM/Opus, WebM, MP4), muestra permiso/grabación/segundos, limita 60 s y 10 MiB, y ofrece detener/enviar o cancelar. MP4 siempre genera voice.m4a/audio/mp4. Permisos tardíos tras cancelar/desmontar cierran todas las pistas. No se transcribe ni analiza audio localmente.

`useSpeech` controla request, Audio y object URL. TTS usa exclusivamente spokenAnswer. Autoplay configurable solo para voz; texto requiere botón. Rechazo de autoplay ofrece reanudar; se detiene el audio anterior al enviar otra consulta o reproducir otra respuesta. Todas las operaciones y recursos se cancelan al cerrar, cambiar identidad o salir.

La conversación textual/básica local contiene hasta 40 mensajes y no se manda como historial. Se mantiene al navegar mientras AppShell/panel permanecen montados; móvil cierra al seguir referencias. Cerrar conserva conversación/mensajes en el panel montado y libera media/requests; Nueva conversación la reemplaza. El diálogo nativo gestiona foco modal/Escape; al cerrar vuelve al botón. Panel de hasta 480 px en desktop, pantalla móvil con 100dvh/safe areas y visualViewport para teclado; comparación usa scroll horizontal deliberado. Live agrega WebRTC sin dependencias nuevas; no se agrega persistencia en browser, relay WebSocket, RAG ni LangGraph.

### Realtime Voice 2B — GPT-Live

`live/contracts.ts`, `events.ts`, `service.ts`, `connection.ts` y `activity.ts`, con `useLiveVoice` y `LiveTranscript`, implementan la conexión dentro del panel actual. Solo se monta para la identidad gerencial validada. El botón principal solicita getUserMedia por gesto, agrega tracks a RTCPeerConnection y crea `oai-events` antes de la oferta. Espera ICE completo (máximo 10 s), envía el SDP mediante ApiClient/BFF, aplica la respuesta y espera `session.started` con el mismo sessionId (límite de conexión 45 s). No envía session.start/update, configuración del modelo ni claves. El audio remoto se conecta a HTMLAudioElement por MediaStream, sin fetch de audio Live ni Blob. Autoplay bloqueado ofrece un gesto para activarlo.

El BFF mantiene exactamente dos POST Live: session y close, sin query/rutas adicionales ni origen controlado por el navegador. Lee el JSON una vez, limita **bytes reales** del request a 64 KiB aun sin Content-Length y acota la lectura a 10 s. La respuesta JSON upstream tiene un límite de 512 KiB (incluye escapes JSON); el SDP se limita independientemente a 32 KiB UTF-8. Rechaza campos adicionales; no acepta question/callId ni ruta delegate. SessionId es opaco: string no vacío, máximo 128 caracteres, sin controles C0/C1; no impone prefijo/alfabeto ni transforma el valor. Ese mismo contrato se usa en creación, session.started y cierre. Los IDs de eventos de UI conservan `[A-Za-z0-9_-]{1,128}`. La respuesta de `live/session` usa un parser propio con objeto exacto `{ sessionId, sdp }` (campos extra rechazados). Para SDP solo exige string no vacío, máximo 32 KiB, comienzo `v=0` y ausencia de NUL. No exige fingerprint, ICE, BUNDLE ni líneas media específicas: RTCPeerConnection hace la validación definitiva. Conserva literalmente espacios, CR/LF y el status 201; acepta `application/json` con o sin charset. Para los campos de sesión usa un filtro específico de credenciales y URLs, sin tratar direcciones ICE o contraseñas ICE como hosts privados/rutas de archivos. El filtro genérico sigue vigente para las demás respuestas. No registra SDP ni expone headers del proveedor, errores crudos o credenciales; no modifica multipart/MP3 existentes.

El filtro distingue las URI públicas de extensiones RTP de las URLs de servicios. Permite coincidencias exactas de abs-send-time, abs-capture-time y transport-wide-cc (01/02) del [registro de extensiones de libwebrtc](https://webrtc.googlesource.com/src/+/refs/heads/main/api/rtp_parameters.h), exclusivamente en la posición URI de `a=extmap` definida por [RFC 8285](https://www.rfc-editor.org/rfc/rfc8285.html). No descarga esas URI ni modifica el SDP devuelto. Las credenciales se buscan en el texto original completo; las URLs restantes (incluidos dominios parecidos, query/fragment y URLs en otros atributos o sessionId) siguen rechazándose. Un filtro indiscriminado de `http://` sobre SDP rechazaría estas extensiones legítimas.

Diagnóstico temporal de `live/session`: en `pnpm dev` (`NODE_ENV=development`), `server/liveDiagnostics.ts` emite `live_bridge_stage` para las once etapas desde request_received hasta response_returned; un rechazo emite `live_bridge_failure` con la etapa intentada y categoría fija. Registra únicamente status, media type normalizado, bytes leídos, nombres de campos conocidos (otros se redactan), tipos/longitudes y flags estructurales de SDP. Para seguridad añade securityField, securityRule y hasExtmapHttpUri, sin imprimir las coincidencias. Nunca imprime valores sessionId/SDP, mensajes/stack de excepciones, tokens o headers. No emite trazas en producción ni añade diagnósticos a la respuesta pública. Para el smoke, pulsar el micrófono una sola vez y consultar solo esas líneas en la terminal de Next. Retirar esta instrumentación temporal tras verificar el smoke de la corrección; no confundir resultados de fixtures con metadata de una sesión real.

Parser de data channel cerrado: máximo 64 KiB por mensaje, eventos desconocidos ignorados, sin any. Admite session.started/closed/error, captions input/output y lifecycle Responses únicamente como estado visual. Todos los function items y argumentos se ignoran sin interpretarlos: no existe fetch delegate, deduplicación empresarial ni constructor de function_call_output en browser. El único comando enviado por este cliente es session.close.

Intelligence usa el sideband privado como único owner de consult_sng_intelligence. Allí valida argumentos, vuelve a autorizar Gerencia, ejecuta Agent Core, deduplica y devuelve spokenAnswer por response.item.create seguido de response.create. El provider restringe los permisos del data channel para impedir ejecución incluso desde un cliente alterado. No llegan tool items/resultados ni razonamiento al frontend. Se retiró la sección de tarjetas Live que dependía del relay; captions, controles, chat y las tarjetas de chat/fallback conservan sus flujos. No se crean tarjetas ni referencias a partir del audio del modelo.

El Bearer continúa viajando solo por HTTP/BFF a Intelligence. Solo Intelligence puede retenerlo bajo la excepción autorizada de Voice 2C: SecretStr privado, máximo 600 s, revalidación por consulta y revocación en cierre/expiración/fallo. El frontend no recibe ese contexto ni API keys. No cambia el almacenamiento de sesión Google existente.

Los estados son idle, connecting, listening, user_speaking, assistant_thinking, assistant_speaking, error y closing. Transcripciones y ciclo de Responses aportan eventos oficiales. GPT-Live no ofrece aquí eventos speech_started/stopped del Realtime clásico: la actividad de micrófono/track remoto se observa localmente con AudioContext (RMS con 250 ms de estabilidad), sin grabar ni transmitir muestras desde JavaScript. Es un indicador de actividad, no detección de turnos de negocio. Si no hay medición, los eventos de transcripción siguen actualizando el indicador. Nunca se presenta razonamiento ni se deduce fin de audio desde response.completed. GPT-Live gestiona full duplex/interrupciones; la UI prioriza actividad del usuario y no manda response.cancel ni usa audio.pause como mecanismo de barge-in. La efectividad acústica se verifica en smoke real.

Las transcripciones conservan espacios/repeticiones y timestamps start_ms/end_ms, ordenadas por tiempo, con agrupación visual consecutiva por hablante; no afirman límites exactos de turno. Se retienen hasta 160 fragmentos, solo en memoria. Event IDs se deduplican (4096 por sesión); al alcanzar límites de sesión se informa y cierra. No hay persistencia ni logs de SDP/transcripts. Conversation 3A comparte turnos semánticos empresariales entre Live y chat mediante el servidor; los captions no alimentan memoria. Fallback básico permanece stateless. No se implementa ElevenLabs.

La sesión tiene un límite absoluto local de 600 segundos; expirar finaliza WebRTC y solicita cierre al servidor. Mute cambia track.enabled sin cerrar. Finalizar detiene inmediatamente micrófono/medición/audio y aborta consultas; intenta session.close y POST live/close con la identidad original. Espera hasta 1.5 s por session.closed y hasta 3 s por revocación backend; indica cierre remoto no confirmado si corresponde. Al cerrar visualmente el panel o desmontar por logout, salida del área Management o cambio de Subject libera transportes inmediatamente tras solicitar cierre, descarta respuestas tardías y elimina estado local. Un permiso tardío detiene sus tracks; una creación tardía intenta revocar el sessionId sin adjuntar SDP. Si se perdió la respuesta de creación no se conoce el ID: cierre local/cancelación no garantizan revocación remota; aplica la caducidad del backend/proveedor. No hay reconexión automática. Reload pierde el hilo.

Fallos visibles distinguen permisos, micrófono no disponible, contexto inseguro, navegador incompatible, Live no disponible, sesión vencida, delegación, red, límites y acceso denegado. 401 conserva invalidación global y 403 no cierra la sesión Google. Siempre puede elegirse voz básica explícitamente cuando Live no está activo; no hay downgrade silencioso.

Protocolo consultado: [WebRTC GPT-Live](https://developers.openai.com/api/docs/guides/voice-webrtc), [delegación y herramientas](https://developers.openai.com/api/docs/guides/live-delegation), [sesiones y transcripciones](https://developers.openai.com/api/docs/guides/live-conversations). No mezclar estos eventos con Realtime API clásico.

### Documentos y handoff de Frontend 2B.1

El panel `DocumentsPanel` está en `/projects/[id]`, sin nuevas páginas. `documentsService` usa estas rutas relativas al BFF:

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `projects/{id}/documents` | Vigentes, históricos, snapshot inicial y capabilities |
| POST | `projects/{id}/documents/batch` | Agregar/reemplazar en un batch multipart |
| DELETE | `projects/{id}/documents/{documentId}` | Quitar del proyecto antes del handoff cuando está permitido |
| GET | `projects/{id}/documents/{documentId}/file` | Descargar actual o histórico |
| GET | `projects/{id}/documents/current.zip` | ZIP vigente del backend |
| GET | `projects/{id}/documents/initial-handoff.zip` | Snapshot inicial del backend |

ProjectDocuments contiene documents, initialHandoff, canModify, canRemove y canSendToBudgets. Backend es autoridad y revalida cada operación. ProjectDetail restringe además presentación por área activa y ownership; no concede permisos si una capability es false. Un 403 documental solo afecta su panel y se reconsulta tras conflictos.

`ProjectDocument.contentType` admite `string | null` y no se usa para renderizar archivos. Cancelar selección o reemplazo limpia tanto el estado React como los valores de ambos inputs file, permitiendo volver a elegir inmediatamente el mismo archivo.

La selección permite múltiples archivos por click o drag/drop y exige envío explícito. Valida bytes exactos: 100_000_000 por archivo, 300_000_000 por operación, máximo 15 vigentes contando existentes + additions y rechazo de 0 bytes. No filtra MIME/extensión/nombres duplicados. `formatBytes` presenta B/KB/MB sin modificar los valores de validación. No se leen los archivos para validar, renombrar, transformar o codificar a base64.

`documentBatch` agrega primero `manifest`, Blob `application/json`, con `{ files: [{ partName: "file-0", replacesDocumentId: null | id }, ...] }`; luego añade los File originales en partes `file-0`, `file-1`, etc. El browser genera el boundary global. El service acepta múltiples operaciones, aunque esta UI reemplaza un documento por operación. La respuesta de batch no se usa como contrato de lista: se vuelve a consultar GET documents tras éxito.

Reemplazar exige seleccionar explícitamente un archivo y confirmar que el anterior se conserva en historial; nunca se infiere por nombre. Quitar exige confirmación, `canRemove` y documento vigente; no ofrece retiro en históricos. Después del handoff, `canRemove=false` viene del backend. Se muestran fecha, tamaño, nombre original, uploader name/email, pertenencia al envío inicial y relación de reemplazo; no StorageKey ni Subjects documentales.

El snapshot inicial muestra fecha, actor y cantidad de `documentIds`; se descarga desde backend sin reconstruirlo. PrepareQuotation sin snapshot es un caso legacy: se informa y no se ofrece ZIP inicial. Las bajas lógicas que no devuelve la API no se inventan.

Upload/remove/replace refrescan documentos. Después del handoff (incluido legacy con tarea), upload/replace refrescan también notificaciones, conservando la tarea sin modificarla ni recalcular Lead Time. `ProjectDocumentsUpdated` es un NotificationKind normal y presenta título/mensaje del backend, sin interpretarse como alerta de atraso. Las selecciones permanecen en errores y se limpian en éxito; no hay retries automáticos. Se muestran mensajes locales para FileTooLarge, BatchTooLarge, DocumentLimitExceeded, InvalidDocumentBatch, InvalidReplacement, DocumentRemovalLocked y DocumentUnavailable.

El contenido operativo del detalle tiene key por id de proyecto y `user.subject`. Un cambio de identidad desmonta consultas, selección y acciones anteriores, cancela solicitudes pendientes y vuelve a consultar proyecto/cliente/tareas/notificaciones/documentos incluso si la instancia ApiClient es estable. Las respuestas tardías no restauran capabilities de la cuenta anterior. No se introduce caché global.

Next mantiene streaming de entrada y salida: no consume uploads/ZIP/binarios con arrayBuffer/Blob/Buffer. El fallback Blob existe únicamente en browser y puede necesitar memoria proporcional al archivo completo. El timeout documental de diez minutos también requiere límites compatibles en el entorno de despliegue/proxy; no elimina la cancelación del browser.

## TLS local

El certificado HTTPS de desarrollo del backend debe ser confiable para el proceso Node que ejecuta Next, además del navegador. Si falla la confianza, corrige el certificado o el trust store apropiado y repite el smoke.

Para que Node use las CA del sistema en desarrollo Windows:

```powershell
$env:NODE_USE_SYSTEM_CA="1"
pnpm dev
```

En Git Bash: `NODE_USE_SYSTEM_CA=1 pnpm dev`. Esto incorpora las CA del sistema; no acepta certificados inválidos ni elimina la verificación TLS. El certificado de desarrollo .NET debe estar previamente confiado.

No se desactiva validación TLS global ni por request. No se usan agentes que acepten cualquier certificado. Un error TLS se trata como 502 seguro; no demuestra que Google haya rechazado la identidad.

## UI y accesibilidad

`/login` presenta SnG Control, Steel & Glass, el botón oficial y estados de carga/error; una sesión validada redirige a `/`.

`AuthGate` muestra loading, redirige no autenticados a `/login` y renderiza children únicamente con sesión validada.

AppShell agrupa Sidebar, TopBar y contenido. Advisor ve Inicio/Clientes/Proyectos/Tareas/Notificaciones; Budgets y Head priorizan Inicio/Tareas/Notificaciones; Management muestra Resumen/Operación y el launcher Intelligence. TopBar muestra identidad, área activa y logout, con selector si hay varias membresías. El menú móvil conserva accesibilidad y foco. No hay módulos futuros ficticios.

La home presenta accesos reales a proyectos, clientes, tareas y notificaciones, sin consultas adicionales ni métricas. Nombre/email permanecen visibles; Google Subject y Copiar Subject se agrupan en el disclosure secundario “Identidad técnica de la sesión”. Los valores nulos se presentan como “No disponible”. Copiar Subject invoca `navigator.clipboard.writeText(user.subject)`. La API requiere contexto seguro (HTTPS o localhost) y permisos del navegador; el fallo indica cómo copiar manualmente.

### Sistema visual Steel & Glass

`globals.css` centraliza tokens en `:root`: background/surface/surface-subtle, ink/ink-soft, border/border-strong, brand/brand-hover/brand-soft, accent/accent-soft y pares semánticos success/warning/danger/neutral. Los componentes compartidos usan `@layer components` para botones, formularios, tablas, panels, toolbar y feedback. La stack Inter/system-ui/Segoe UI no descarga fuentes; el cuerpo operativo es de 14 px, con encabezados compactos y metadatos secundarios. Panels de 12 px de radio y padding aproximado de 19 px priorizan líneas y superficies sobre sombras.

`src/components/ui/` contiene únicamente PageHeader, StatusBadge (neutral/info/success/warning/danger), EmptyState e Icon (SVG internos decorativos). Los badges de tareas, Lead Time y notificaciones comparten la semántica; las etiquetas siguen siendo las del estado backend. ErrorNotice conserva sanitización y mensajes; códigos diagnósticos tienen menor jerarquía visual.

El shell usa `Shell.module.css`: Sidebar azul pálido fija de 224 px desde 1024 px, wordmark tipográfico S&G / CONTROL, navegación activa con acento lateral y usuario al pie. Los tokens `--nav-*` están limitados al shell. TopBar tiene altura mínima de 56 px, identidad y logout a la derecha; producto y menú se muestran únicamente bajo desktop. Main ocupa el ancho disponible hasta 1600 px, con padding de 16/24/28–32 px. El menú conserva sus controles y foco. Home, clientes, lista/creación de proyectos, tareas y notificaciones mantienen sus componentes actuales.

El detalle es una superficie continua de expediente, no una secuencia de panels. ProjectHeader integra nombre, cliente/ciudad/línea, SG técnico y responsable/creación. ProjectStatusStrip es una franja con divisores; conserva la selección InProgress, luego Pending o una tarea existente, usando exclusivamente campos backend. `ProjectDetail.module.css` separa documentación/acciones y actividad/tareas mediante líneas: una columna hasta 1199 px y dos desde 1200 px, con lateral de 320–340 px. Sin acción, las tareas ocupan la columna lateral desde arriba.

DocumentsPanel se integra sin shell `.panel`: dropzone baja, filas documentales con acciones discretas, histórico sin caja gris y snapshot como auditoría con divisor. Su CSS Module conserva wrap para nombres largos. No muestra IDs, MIME ni UploadBatchId. TaskList `compact` muestra estado, Lead Time y fechas directamente, con divisores entre tareas; su modo normal no cambia. NotificationList `variant="activity"` usa lista semántica con puntos, línea y fechas, sin contenedor rectangular por evento; conserva títulos, mensajes, estados y metadatos. El modo por defecto de `/notifications` permanece igual. Los ajustes de color de tareas se limitan al expediente: En curso neutral, En tiempo verde sobrio, avisos ámbar y atrasos rojo.

Se conservan landmarks, labels, aria-current/expanded/controls, skip-link y foco tras navegar. Los controles usan focus-visible; disabled real y cursor-not-allowed; loading/status, éxito y errores son mensajes accesibles. Los iconos son aria-hidden. Las tablas tienen scroll deliberado, archivos largos usan wrap y las acciones se distribuyen en varias líneas; reduced-motion elimina transiciones. La verificación manual debe cubrir 375, 768, 1024 px y desktop amplio; los tests estructurales no sustituyen esa inspección visual.

## Tests

Vitest + Testing Library + jsdom para estado y UI; entorno Node para configuración y Route Handler. Google se mockea y fetch se sustituye localmente. Las credenciales de prueba son cadenas opacas, no JWT inventados.

Las suites verifican:
- Bearer, 200, 401, contrato JSON y errores de red/backend.
- Persistencia después de validar, restauración, errores de almacenamiento y logout.
- Strict Mode y respuestas tardías después de cerrar sesión.
- Ausencia de uso de localStorage y de renderizado de tokens.
- Identidad, Clipboard API, valores nulos y feedback accesible.
- AuthGate, redirecciones, login y callbacks de Google sin Internet.
- Configuración pública/servidor y puente: ruta fija, headers, timeout, no caché, no redirects y saneamiento de respuestas.
- BFF: allowlist, traversal, métodos, querystring, JSON, bytes/boundary multipart, binarios, nombres seguros, status y sanitización.
- API client: Bearer, JSON GET/POST/PUT, FormData, Blob/filename, ProblemDetails y ausencia de autenticación inventada.
- Integración API/sesión: 401 concurrentes, 403/409/503 sin logout y respuestas tardías de sesiones anteriores.
- Shell: protección, identidad, logout, menú accesible, estructura responsive y enlaces reales.
- GSI: librería instalada con límite SDK simulado, Strict Mode y estabilidad del montaje durante validación.
- Clientes/proyectos: carga, vacío, selección de cliente, cuatro líneas, creación, nombres duplicados, navegación y doble submit.
- Detalle/SG: cargas relacionadas, 404, confirmación, envío sin body, primera asignación, formato ASCII/ceros, corrección con las mismas fechas, conflictos 409 y recuperación de lecturas fallidas tras éxito.
- Tareas/notificaciones: área fija por rol y estado filtrable, defaults y vacíos por rol, cambio de rol con cancelación/remontaje, lookup sin N+1, respuestas tardías descartadas, ocho estados temporales, timezone, historial activo/resuelto y ausencia de estado leído/no leído. Estas pruebas recorren el cliente API con fetch simulado; no llaman al backend real.
- Documentos: capabilities, carga/drag-drop, manifest-first, límites exactos, nombres duplicados, reemplazo e históricos, retiro confirmado, handoff y DocumentsRequired, notificación documental sin reinicio temporal, descargas y cambio de Subject con ApiClient estable.
- Infraestructura documental: DELETE restringido/204, ZIP y stream intactos, timeout por ruta, cancelación, filename seguro, File System Access y fallback con revocación de object URL.
- Gerencia: flag obligatorio en ambos extremos de auth, restauración/cambio de identidad, navegación/protección visual, 401/403, cancelación y descarte de datos tardíos con ApiClient estable, overview/áreas/atención/nulos/vacíos, orden/filtros locales/búsqueda, rutas BFF exactas de solo lectura y convivencia de permisos de Gerencia con capacidades operativas.

Las pruebas de Intelligence sustituyen fetch, MediaRecorder, getUserMedia, Audio y ObjectURL. Cubren contratos/renderers, autenticación y requests tardíos, sesión/chat/referencias/candidatos, MIME WebM/MP4, permisos, cancelación/60 s/bytes, spokenAnswer, autoplay/pausa/reanudación/revocación, BFF estricto y streaming. No llaman a FastAPI, Google ni proveedores reales.

Realtime Voice 2C conserva mocks de RTCPeerConnection, RTCDataChannel, MediaStream y tracks. Cubre SDP/session.started, estados/transcripciones, mute, cierre confirmado/no confirmado, permisos tardíos, tools reflejadas ignoradas, ausencia de fetch delegate/tool outputs y límite de 600 s, errores, identidad/logout con Bearer original, contexto continuo sin reescritura, continuidad de texto/Live y fallback independiente funcional. El BFF prueba rutas/métodos exactos, status, sanitización y límites de bytes reales/SDP. No se llama a OpenAI.

No hay Playwright ni snapshots de credenciales. Los tests no comparan clases Tailwind.

## Comprobación local de integración

1. Configura ambas variables en `.env`, conservando el archivo ignorado por Git.
2. Inicia el backend en su entorno habitual y verifica el certificado confiable para Node.
3. Ejecuta `pnpm dev` y abre `/login`; comprueba que aparece el botón oficial.
4. Inicia sesión con una cuenta permitida por Google y el backend.
5. Confirma redirección a `/`, accesos rápidos, nombre y correo.
6. Abre “Identidad técnica de la sesión”, usa Copiar Subject, recarga y confirma restauración.
7. Cierra sesión y confirma `/login`; la home no debe mostrar identidad al abrirla sin sesión.
8. Con un token rechazado por el backend, confirma 401, eliminación y mensaje seguro.
9. Crea un cliente en `/clients` y un proyecto en `/projects/new`; confirma la navegación al detalle.
10. Verifica que el proyecto sin documentos pida cargarlos; selecciona/arrastra varios, sube, prueba quitar antes del handoff y vuelve a cargar. Envía a Presupuestos tras confirmar; verifica snapshot inicial, PrepareQuotation Pendiente/Sin iniciar y vencimiento sin fecha.
11. Con la cuenta asignada a PrepareQuotation, asigna SG001; comprueba SG, tarea En curso, inicio/vencimiento reales y notificaciones. Corrige a otro SG disponible y verifica que inicio/vencimiento se conservan según backend. Con otra cuenta, verifica que SG y avance sean de consulta y no existan controles de asignación/corrección.
12. En `/tasks`, selecciona Presupuestos y el estado correspondiente; comprueba el proyecto y su enlace. Revisa `/notifications` y el historial del proyecto, incluidas alertas resueltas. Verifica navegación móvil y desktop.
13. Con capacidad de modificación, agrega/reemplaza documentos después del envío. Comprueba historial, notificación ProjectDocumentsUpdated y fechas de tarea sin reinicio. Con Presupuestos, comprueba solo consulta/descargas individual, ZIP actual e inicial.
14. Cambia de cuenta y vuelve a la misma URL sin Ctrl+F5; verifica que se actualizan datos/capabilities. Prueba descargas con File System Access y fallback según soporte del browser, además de un proyecto legacy sin snapshot.

Smoke de Gerencia: con una cuenta configurada como Gerencia en backend, comprobar Management en roles de `/api/auth/me`, seleccionar Gerencia como área activa y verificar restauración, navegación, `/management` y `/management/tasks`; probar filtros y enlaces a proyecto. Verificar consulta de actividad/documentos/históricos/snapshot y descargas autorizadas, sin controles SG/escritura/envío bajo el área activa Gerencia, aunque la cuenta posea otros roles. Cambiar a una cuenta no Gerencia sin hard refresh: desaparecen enlaces/datos y el acceso directo queda denegado. Verificar 403 sin logout y layouts/foco a 375, 768, 1024 px y desktop amplio. No se realizó smoke con credenciales reales ni inspección visual de estos tamaños en el entorno automatizado; requiere navegador y backend disponibles.

Sin las dos variables y un backend activo, un 200 de la página solo verifica que Next sirve la UI. Los tests del puente con fetch mock no prueban la integración .NET ni Google real. No confundas esos resultados.

Smoke pendiente de Intelligence: preparar configuración independiente, iniciar sesión Gerencia y abrir el botón; verificar session/chat/references/clarification y unavailable. Probar permiso aceptado/denegado, captura WebM y MP4/M4A según navegador, transcripción, spokenAnswer/TTS, pausa/reanudar, autoplay bloqueado, cancelación y logout con audio/requests activos. Verificar navegación móvil/desktop, teclado y safe areas en 375, 768, 1024 px y desktop amplio. Falta smoke real con audio y servicios; la suite automatizada no lo sustituye. La integración parte del Frontend 3A final (2580289) y aplica únicamente el delta Intelligence 1C; el snapshot temporal no forma parte de su historia. Los tests conjuntos cubren navegación del shell, limpieza por identidad y 403 independientes sin cerrar sesión. El smoke manual conjunto queda para el siguiente bloque.

Smoke real pendiente de Realtime Voice 2C: iniciar desde el micrófono principal y comprobar respuesta hablada/indicadores, una aclaración contextual (“La de Ximena”), interrupción durante habla, varias consultas en la misma sesión, mute, finalización, pérdida de red, 403, cambio de cuenta/logout con delegación pendiente y ausencia de captura en background. Verificar fallback elegido explícitamente y layouts/foco a 375/768/1024/desktop. El entorno de automatización no expuso navegadores disponibles; no se hizo smoke de audio/proveedor ni inspección visual real. Requiere Intelligence 2C configurado y servicios activos; no hay nueva variable pública ni clave OpenAI frontend.

## Límites y siguiente bloque

Frontend 3A agrega Gerencia al flujo y sistema visual de 2B.5. Presupuestos 4C/4D agrega preview técnico XLSX, edición de once campos, confirmación inicial, estado persistente y envío a Comercial. Comercial 4E agrega descarga operativa, preview de solo lectura con economía y diferencias, y confirmación que inicia PresentQuotationToClient. Intelligence agrega consulta textual/voz como feature separada. No implementa aprobación/pago, roles inventados, permisos simulados ni cálculos de negocio. El backend sigue siendo la autoridad.

### Smoke de Presupuestos 4C/4D

El usuario confirmó el smoke principal real de 4C: versión 1, 22 ítems, cantidad 26 y PrepareQuotation InProgress después de confirmar. Se conserva el checklist de regresión:

1. Iniciar sesión como Presupuestos; abrir un proyecto enviado a esa área, con SG asignado y PrepareQuotation InProgress.
2. Seleccionar XLSX estándar del mismo SG y generar preview. Verificar metadata, orden Main/Additional, cantidades, imágenes y warnings contra el archivo real.
3. Editar un campo técnico; comprobar que m² no cambia al editar ancho/alto. Confirmar y comprobar versión, fecha y diferencias reales.
4. Verificar que PrepareQuotation siga InProgress con sus fechas backend y que no se haya enviado automáticamente a Comercial.
5. Probar SG distinto, workbook no soportado y Excel corrupto; revisar mensajes seguros y ausencia de confirmación ficticia.
6. Reemplazar archivo y cambiar proyecto/cuenta durante preview: no debe sobrevivir el borrador ni una respuesta tardía. Confirmar con warnings de imagen faltante/ambigua.
7. Revisar teclado, labels, foco y ausencia de overflow horizontal en 375, 768, 1024 px y desktop amplio; comprobar documentos, SG y actividad del expediente.

El usuario verificó el smoke real de 4D: reload después de confirmar conserva Confirmed y recupera metadata del Backend; Enviar a Comercial exige confirmación humana y Cancelar no modifica estado; el envío exitoso completa PrepareQuotation, crea/inicia ReviewQuotation y actualiza tareas/actividad; el reload posterior conserva SentToCommercial sin botón de reenvío. Para regresión por cambio SG, usar únicamente un proyecto sintético o un caso seguro, sin manipular proyectos reales para forzar el error.

El smoke funcional principal de 4D está aprobado por el usuario. No se ha confirmado en este cierre la inspección responsive/teclado de 375, 768, 1024 px y desktop; los tests con red mockeada no la sustituyen.

### Smoke preparado de Comercial 4E

Pendiente de ejecución real y revisión visual; los tests con red mockeada no sustituyen Excel, login real ni inspección de navegador.

1. Login como Jefe Comercial; abrir un proyecto enviado por Presupuestos con ReviewQuotation InProgress. Comprobar que aparece Revisión Comercial; otro Subject no debe ver el panel.
2. Descargar cotización y abrirla en Excel. Verificar estructura, formato y valores confirmados por Presupuestos.
3. Modificar de forma controlada un valor técnico y precios, guardar XLSX y generar preview. Comparar total del proyecto, unitarios/totales, diferencias reales y ausencia de falsos cambios con el archivo.
4. Pulsar Confirmar cotización comercial y Cancelar: nada debe cambiar. Repetir y Confirmar usando el mismo archivo.
5. Verificar ReviewQuotation Completed y PresentQuotationToClient InProgress asignada al asesor creador original, con fechas y actividad oficiales.
6. F5: no reaparecen upload/preview/confirmación; las tareas persisten. Descargar cotización final y verificar que es el XLSX confirmado.
7. Revisar 375, 768, 1024 px y desktop amplio: cards, precios y diferencias legibles sin overflow horizontal obligatorio. Verificar etiquetas, foco y confirmación/cancelación por teclado.

No alterar proyectos reales para provocar errores artificiales. Los escenarios de fallo/concurrencia/identidad están cubiertos con mocks.

Deuda funcional: la autorización actual permite crear clientes/proyectos a cualquier Google autenticado. Gerencia tiene una restricción únicamente de UX descrita arriba. La seguridad de estas operaciones y una capability de creación para identidades mixtas requieren futura autorización general de Comercial en backend.

Mantener actualizados ambos README cuando cambie el comportamiento. `.gitignore` excluye `.env`, `.env.local`, `.env.*.local`, node_modules, .next, coverage, logs y el almacén local de pnpm. No incluir valores reales en documentación o tests.

Referencias: [Next.js instalación](https://nextjs.org/docs/app/getting-started/installation), [variables de entorno](https://nextjs.org/docs/app/guides/environment-variables), [React OAuth Google](https://github.com/MomenSherif/react-oauth). Para la versión instalada consulta también `node_modules/next/dist/docs/`.

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


## Persistent Conversations V1 — resume y recuperación limitada

`conversation.ts` valida create/resume `{conversationId, createdAt, lastActivityAt}`.
Los timestamps requieren timezone explícita (`Z` u offset RFC3339 como `-05:00`) y
`Date.parse` válido; conserva el valor y precisión recibidos, sin normalizar a UTC;
close conserva `{closed:true}`. No hay expiresAt para conversaciones. IDs opacos base64url
(43 caracteres), generados por servidor y asociados al subject oficial; no son autenticación.
`useConversation` llama resume al montar y descarta resultados tardíos. Unmount/logout no
cierra el hilo durable. El key por identidad desmonta UI/requests/media sin heredar estado.
Nueva conversación llama create explícito; Intelligence archiva el hilo abierto en esa transacción.

El BFF permite POST `conversation`, `conversation/resume` (body `{}`) y `conversation/close`
(body `{conversationId}`), rechaza campos adicionales, conserva 200/201 y no-store. Solo para
un 404 con `error=conversation_unavailable` del upstream reenvía `code=conversation_unavailable`.
No publica mensajes arbitrarios ni detalles de infraestructura. `IntelligenceError` reconoce solo
ese código/estado. Chat/Live no cambian sus contratos ni permisos del data channel.

Texto: ante ese error exacto se descarta el selector local, resume y se repite el mensaje una
vez; una segunda falla se muestra. No retry para otros 404/409/429/5xx. LiveConnection libera
micrófono/tracks/canal/peer antes de informar el selector obsoleto al hook. useLiveVoice hace
resume y crea una nueva instancia/offer una sola vez. Cancel/unmount aborta la recuperación;
no puede abrir un peer tardío. La expiración de Live permite reconectar al mismo conversationId.
No cambia getUserMedia, VAD, STT/TTS, grounding ni la ejecución server-side de tools.

PostgreSQL propio de Intelligence conserva todos los turnos semánticos validados y referencias
mínimas. Su runtime de un worker mantiene locks/cancelación/bindings separados. Shutdown
revoca Live/credenciales y cierra el pool, sin cerrar conversaciones. La proyección al modelo
usa hasta 16 turnos/16000 caracteres (Live input 6000 bytes), sin truncar almacenamiento.
Historia solo resuelve referentes: cada ejecución consulta hechos actuales nuevamente.
Sin ID, chat y voz básica siguen independientes. No se guardan captions/SDP/audio en ese historial.

El frontend conserva solamente cache local. Reabrir/F5 retoma por subject, sin browser storage;
el transcript visual anterior no se descarga ni reconstruye en V1. No hay títulos, lista/búsqueda,
rename/delete UI, resúmenes ni sincronización realtime de dispositivos. Credenciales Google y
TLS conservan su boundary anterior; la nueva conexión PostgreSQL existe solo en Intelligence.

Tests offline cubren remount, continuidad ID texto/Live, nuevo hilo, identidad/logout, respuestas
tardías, recovery exacto una vez, cierre provisional de media y expiry Live sin pérdida de hilo.
Smoke manual pendiente de DB configurada: dos turnos, restart Uvicorn/F5, resume mismo ID y
tercer turno referencial con lectura fresca; repetir reabrir navegador y reconectar voz.


## Management Intelligence 4A: Presentation

Extensión compatible de los siete responseType existentes; sin nuevos endpoints:

- `management_brief`: añade `areas?: AreaItem[]`, `attentionCoverage?: Coverage | null`
  y `tasksCoverage?: Coverage | null`. Coverage contiene total/returned/hasMore;
  el parser valida counts no negativos, returned <= total y consistencia de hasMore.
- `comparison`: conserva `areas`, añade `projects?: ComparedProject[]`. No mezcla ambos.
  Cada proyecto contiene `{project: ProjectItem, metrics: Metric[], tasks: TaskItem[]}`.
  El parser valida 2–4 proyectos distintos cuando no está vacío, UUID, counts y asociación
  projectId de cada tarea. No interpreta enums ni calcula estados desde deadlines.
- Campos nuevos ausentes siguen siendo compatibles con respuestas anteriores.
- `IntelligenceResponseView` mantiene explicación antes de metadata. Tarjetas semánticas
  con `<article>`, labels, métricas `<dl>` y links; tareas bajo `<details>`. Grid de dos
  columnas en escritorio y una en móvil, sin tabla ancha obligatoria.
- `tests/management-intelligence.test.tsx` cubre contratos, cobertura, accesibilidad,
  navegación, opcionales, ausencia de enums técnicos y continuidad texto/Live/texto con
  el mismo conversationId. Los tests existentes de Live siguen verificando aislamiento
  y que el browser no ejecuta tools. jsdom comprueba semántica, no layout de píxeles.

Backend es autoridad; el modelo no suministra IDs/métricas para rendering. Conversation 3A
mantiene grounding y ownership, con persistencia semántica propia en Intelligence; no se añaden almacenamientos locales.
El smoke pagado/manual está pendiente; los fixtures offline no demuestran precisión real
ni latencia de OpenAI. Usar el plan de preguntas de README y validar cards en móvil.

## Identity & Areas V1: sesión y transporte

AuthProvider expone availableRoles, activeRole y setActiveRole. Solo roles implementados
pueden seleccionarse; los cinco roles futuros quedan reservados en SystemRole. La clave
`sng.active_role` guarda `{ subject, role }` como preferencia, nunca autoridad: al restaurar
se valida primero el token con Backend, luego la coincidencia de Subject y pertenencia.
Logout borra token/preferencia; otro Subject no hereda el área anterior.

API client envía `X-SnG-Active-Role` en JSON, multipart y descargas. Backend BFF valida
el enum cerrado y reenvía únicamente headers aprobados al origen fijo. Auth/me sigue
sin área para descubrir roles. Intelligence BFF exige Management; su cliente Backend
fija ese valor sin permitir que el modelo lo elija. isManagement permanece solo como
compatibilidad del contrato; no decide la navegación ni amplía permisos.

El cambio de área aborta el controller de requests de sesión, incrementa su generación,
remonta el árbol de experiencia y navega a / o /management. Respuestas 401 antiguas no
invalidan la sesión nueva. Los cierres de Live y el cierre explícito de conversación usan su snapshot original;
una respuesta tardía de creación conserva el ID necesario para revocarla best-effort.
Las operaciones en vuelo pueden haber sido aceptadas por Backend: cancelar la UI no
revierte un handoff confirmado. La consulta nueva siempre recupera estado oficial.

### Smoke de una sola cuenta (sin cambios entre etapas)

Configurar previamente un mismo Subject, exclusivamente en User Secrets de Backend,
en CommercialAdvisorSubjects:0, BudgetsAssigneeSubject, CommercialHeadSubject y
ManagementSubject. Reiniciar los servicios y comprobar los cuatro roles en auth/me.

1. Login → selector → Asesor: crear cliente/proyecto sintéticos, cargar documentación y enviar a Presupuestos.
2. Cambiar a Presupuestos sin logout: Tareas inicia en Budgets/Pending, solo PrepareQuotation propias; abrir proyecto, asignar SG, preview XLSX, confirmar y confirmar humanamente Enviar a Comercial. Verificar estado persistente tras reload.
3. Cambiar a Jefe: abrir ReviewQuotation asignada, descargar Excel operativo, revisar archivo, preview y confirmar Comercial. Verificar Completed y PresentQuotationToClient InProgress; no aparece editor de Presupuestos.
4. Volver a Asesor: consultar su nueva tarea y responsable original. No hay aprobación/pago ni reasignación automática.
5. Cambiar a Gerencia: Resumen/Operación/Intelligence, documentos de solo lectura. Iniciar/cerrar voz y salir a otra área: liberar micrófono/RTC/audio y estado local, conservando el hilo durable.
6. Repetir selector/nav a 375, 768, 1024 px y desktop amplio; comprobar foco, ausencia de overflow y reload de preferencia. Logout limpia área. Manipular el header hacia un rol no poseído debe dar 403.

No modificar secrets, cuenta Google, ownership ni filas de tareas durante el recorrido.
El smoke real y la inspección visual requieren navegador y servicios conectados; los
tests offline no acreditan esa integración.

### Clientes y proyectos compartidos por área

Backend aplica el ámbito antes de devolver datos: Advisor ve proyectos propios y el registro compartido de clientes; Budgets ve proyectos con PrepareQuotation asignada al Subject y sus clientes; Head usa ReviewQuotation; Management es transversal. Completed conserva lectura histórica. Listados, IDs directos y GET internos del expediente están protegidos; la UI no sustituye esa autorización con filtros locales.

ClientsPage/ProjectsPage usan capabilitiesFor para renderizar creación únicamente en Advisor y remontan por Subject/área. ClientDetailPage y la ruta /clients/[id] consultan GET clients/{id} y GET projects del BFF existente, muestran metadata y enlazan solo los proyectos del cliente dentro del listado ya autorizado. No agregan mutaciones ni endpoints Backend. Una denegación del cliente impide la consulta posterior de proyectos. Estado vacío y errores usan componentes existentes; no se persiste contenido entre áreas.

Smoke manual con cuenta multirol: en Presupuestos comprobar los cinco enlaces, abrir cliente relacionado y proyecto asignado, snapshot Budget y acciones según estado, sin Crear cliente/proyecto ni envío inicial. Tras handoff/reload el proyecto sigue visible. En Jefe comprobar el mismo recorrido con ReviewQuotation asignada, snapshots y revisión según estado, sin SG/editor Budget ni edición documental; Completed conserva lectura. En Gerencia comprobar Resumen/Operación/Clientes/Proyectos/Intelligence y ausencia de escrituras. Intentar IDs ajenos desde Budgets/Head y comprobar 403/404 sin datos. Repetir en 375/768/1024 px y desktop, incluido menú móvil, foco, textos largos y scroll horizontal de tablas. La validación visual real sigue pendiente por la limitación de Computer Use descrita arriba.

SharedReadAccess.test.tsx cubre navegación e Inicio, capacidades, estados vacíos y detalle de cliente para las cuatro áreas. IdentityAreas y ManagementIntelligence cubren cambios de área/membresía y limpieza de datos. La matriz funcional completa está en README.md.

Smoke de bandeja personal: Presupuestos abre Tareas en Pendiente y consulta solo PrepareQuotation asignadas; después del handoff puede elegir Completada y seguir leyendo el proyecto, pero no recibe ReviewQuotation. Jefe abre En curso con ReviewQuotation; después de 4E, Asesor abre En curso con PresentQuotationToClient. Cambiar de rol con una consulta pendiente debe descartar la respuesta anterior y reiniciar Estado. El historial del expediente sigue completo y Gerencia sigue usando Operación. TaskInbox.test.tsx cubre este comportamiento con red simulada; no sustituye el smoke con sesión real.


Money Contract V1: preview, confirmación y vista comercial requieren `currencyCode: "COP"`
del Backend. Los parsers cerrados conservan el campo y rechazan moneda ausente/desconocida;
Budget no lo incorpora. Ajuste contractual necesario para aceptar el nuevo payload sin 502,
sin cambios de UI, cálculos ni formato. Desplegar junto con Backend Money Contract V1.
