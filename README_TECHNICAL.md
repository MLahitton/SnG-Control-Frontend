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
  → .NET valida Google → { subject, email, name }
```

`authService` centraliza el fetch de mismo origen. Envía `Authorization: Bearer <ID_TOKEN>`, desactiva caché y no envía cookies. Valida el contrato de identidad y convierte errores de red, JSON y status en errores controlados; no muestra el cuerpo de error del backend.

El Route Handler:
- Exige una cabecera Bearer no vacía y con formato de token HTTP; no valida ni decodifica el JWT.
- Reenvía la misma cabecera Authorization exclusivamente al endpoint fijo.
- Usa `cache: "no-store"`, un timeout de 10 segundos y `redirect: "error"` para no seguir redirecciones con credenciales.
- En 200, exige subject no vacío, email y name de tipo string o null; devuelve únicamente esos tres campos.
- En 401 devuelve 401 y un mensaje seguro.
- Conserva status 400–599 con JSON controlado. Respuestas inesperadas, JSON inválido, error de red, timeout o TLS producen 502.
- Nunca devuelve URL interna, cabeceras del backend, tokens, claims extra ni detalles técnicos. Las respuestas llevan `Cache-Control: no-store` y `Vary: Authorization`.

Este puente específico se mantiene para validar identidad. El navegador solo llama a Next.js; no necesita CORS de .NET para estos flujos. No se modificó el backend.

### BFF de negocio controlado

`/api/backend/[...path]` delega en `backendBridge.ts` y apunta exclusivamente a `{SNG_API_BASE_URL}/api/...`.

- Raíces permitidas: `clients`, `projects`, `project-tasks`, `notifications`. No hay otras raíces ni URLs/hosts/protocolos controlados por el browser.
- Métodos reenviados: GET, POST y PUT. DELETE/PATCH no se exportan; HEAD responde 405 explícitamente para evitar el GET automático de Next. OPTIONS puede responder localmente por Next, sin llegar al backend.
- Segmentos: letras ASCII, números, guiones/guiones bajos y puntos internos entre partes válidas (por ejemplo `confirmed.xlsx`). Rechaza vacíos, puntos solos, barras, backslashes, porcentajes/doble encoding, espacios, query/fragmentos dentro del path y demás caracteres anómalos. Máximo 20 segmentos de 200 caracteres.
- Usa URL APIs y conserva el querystring, incluidos parámetros repetidos. Ningún query puede cambiar el origen o la ruta construida.
- Reenvía solo Authorization, Accept y Content-Type si hay body. No Cookie, Host, Connection, Referer, Origin ni cabeceras arbitrarias.
- Acepta JSON, media types JSON, multipart con boundary, XLSX y octet-stream. El body se reenvía como stream con `duplex: "half"` sin leer/reconstruir FormData ni transformar archivos. POST/PUT sin body también funcionan.
- Fetch con `cache: "no-store"`, `redirect: "error"`, cancelación del request y timeout de 120 segundos para permitir uploads. No reintenta mutaciones automáticamente.
- Conserva status 2xx y 4xx/5xx, incluidos 201, 204, 401, 403, 409 y 413. Redirects inesperados o respuestas no admitidas producen 502. Configuración ausente/inválida produce 503; red/TLS/timeout antes de responder produce 502.
- Todas las respuestas llevan `Cache-Control: no-store` y `Vary: Authorization`. Se permiten Content-Type, Content-Disposition validado y Retry-After numérico o fecha HTTP. Se descartan cookies, Location y headers internos.
- JSON exitoso conserva datos de negocio, eliminando claves de diagnóstico/credenciales y anulando referencias al origen interno, al Bearer recibido o a paths de almacenamiento reconocibles. Descargas XLSX/octet-stream se transmiten sin modificar bytes; su contenido documental es responsabilidad del backend.
- Los binarios se transmiten en streaming: una interrupción posterior a enviar las cabeceras aborta la descarga; el cliente la trata como error seguro. No es posible sustituir el status por 502 después de enviar esas cabeceras.

### Cliente API y errores

`useApiClient()` obtiene la instancia creada por AuthProvider. Sus métodos son `get<T>`, `post<T>`, `put<T>`, `upload<T>` y `download`. El path es relativo al BFF (ejemplo: `projects`), sin slash inicial ni query embebido; las opciones aceptan `URLSearchParams` y `AbortSignal`. Los genéricos representan el contrato esperado; cada futuro servicio debe validar su contrato si requiere validación runtime.

El cliente agrega Bearer, omite cookies, no cachea ni sigue redirects. JSON se serializa centralmente. Para FormData no establece Content-Type: el navegador crea el boundary y el BFF lo conserva. Un 204/205 permite resultados `void`.

`download` retorna `{ blob, filename }` y nunca activa una descarga automáticamente. Lee `filename` o `filename*=UTF-8''...` de Content-Disposition, valida que sea un nombre simple (sin paths ni nombres reservados de Windows) y devuelve null si no es seguro o falta. Nunca toma el nombre de un querystring.

`ApiError` expone status, message, code opcional y ProblemDetails seguros. Los mensajes son locales por status: 403 indica “No tienes permiso para esta acción”; 409 conserva el código de negocio sin imponer lógica de UI.

La allowlist de extensiones acepta `code`, `errorCode`, `field`, `fields` (identificadores acotados) y `retryAfterSeconds` (entero no negativo), tanto en la raíz de ProblemDetails como dentro de `extensions`. Se conservan en 4xx; los 5xx usan diagnóstico genérico. Se descartan title/detail/type/instance libres, stack traces, paths y extensiones desconocidas. Agrega extensiones solo al confirmar un contrato seguro del backend; no expongas indiscriminadamente ProblemDetails.

También acepta `missingItems` y `unexpectedItems` como arrays de `CommercialItemKey`: únicamente `section: "Main" | "Additional"` y `sourceRow` entero seguro positivo. Cada array admite hasta **200 elementos**, incluidos arrays vacíos. Si supera el límite o contiene algún elemento inválido se descarta ese array completo, sin truncarlo; los campos adicionales de los objetos se eliminan. `fileError` acepta solo un identificador ASCII de 1–80 caracteres, iniciado por una letra y seguido de letras, números o guiones bajos. No admite texto libre, URLs ni paths.

Estos tres campos admiten entrada en la raíz o en `extensions`, con la misma precedencia existente: raíz no nula primero. La salida canónica está en `problem.extensions`; `ApiError` además expone propiedades tipadas `missingItems`, `unexpectedItems` y `fileError`. No se permite ningún objeto o extensión arbitrarios.

Los servicios en `features/clients`, `features/projects`, `features/tasks` y `features/notifications` utilizan esta capa con contratos explícitos. Las pantallas obtienen `useApiClient()` y gestionan su estado de envío sin duplicar fetch ni invalidación de sesión.

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
| Tareas filtradas | GET `project-tasks?area={area}&status={status}` |
| Notificaciones personales | GET `notifications`, sin query params |

Crear cliente envía solo `{ name }`; crear proyecto envía `{ clientId, name, city, productLine }`. Los nombres duplicados no se bloquean. La línea acepta Classic, Essential, Bioconfort o Signature. El selector exige un cliente existente; sin clientes ofrece ir a `/clients`. El backend determina `createdBy`; la UI muestra su nombre/email como responsable comercial y no pide ni presenta Subjects en estas pantallas.

El detalle consulta proyecto, cliente, tareas y notificaciones. Solo ofrece enviar a Presupuestos si no existe PrepareQuotation, con confirmación explícita. Al recibir éxito incorpora la tarea y refresca tareas/notificaciones. El envío crea Pending/NotStarted, con inicio y vencimiento nulos: no inicia el plazo de cinco días.

La primera asignación de SG se ofrece con PrepareQuotation Pending y SG nulo. La corrección se ofrece con SG existente y PrepareQuotation InProgress. Se aplica trim + uppercase y `/^SG[0-9]+$/`, sin conversión numérica ni pérdida de ceros iniciales. La respuesta `{ project, prepareQuotationTask }` actualiza ambas entidades y se refrescan notificaciones. Inicio, vencimiento, estado y evidencia de atraso proceden del backend; corregir SG no calcula fechas ni crea tareas.

Todas las mutaciones tienen bloqueo síncrono contra doble submit y controles deshabilitados durante el envío; no hay retries automáticos. Un 409 refresca el detalle. Para SG, el mensaje contempla código en uso o estado incompatible sin afirmar una causa; conserva el business code si existe. Si la mutación ya se guardó y falla una consulta relacionada, la UI conserva el éxito y permite repetir únicamente las lecturas.

`useResource` mantiene estado local de consulta, cancela lecturas al desmontar/cambiar filtros y descarta respuestas tardías. Presenta carga/error/vacío y permite recarga explícita tras fallos. No es una caché global. La lista de tareas exige área y estado en cada solicitud; comienza mostrando Comercial/Pendiente como filtros visibles, sin inferir el área del usuario. Resuelve nombres con un único GET `projects` por montaje, sin consultas por tarea ni nuevas lecturas de proyectos al cambiar filtros.

`TaskList` y `TaskTimingStatus` presentan los tipos/estados y `leakTimeStatus` del backend en español. `formatDate` usa `Intl.DateTimeFormat` con **America/Bogota**, incluyendo hora para vencimientos. No compara deadlines con el reloj ni reconstruye días hábiles. Cuando PrepareQuotation está NotStarted sin deadline, indica que el plazo comienza al asignar SG.

`NotificationList` conserva Informational, Active y Resolved. Resalta Overdue Active y mantiene Overdue Resolved como historial. Muestra título, mensaje, tipo de tarea, fechas y estado; las personales enlazan al proyecto. No muestra recipientGoogleSubject ni incorpora leído/no leído, contadores o acciones de mutación.

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

`AppShell` agrupa Sidebar, TopBar y el contenido principal. Sidebar enlaza Inicio, Clientes, Proyectos, Tareas y Notificaciones; Proyectos permanece activo en creación y detalle. TopBar muestra nombre/email y logout. En móvil/tablet, el botón de menú controla la navegación con aria-expanded/aria-controls; en desktop permanece visible. Hay enlace para saltar al contenido y el foco vuelve al contenido al navegar. No existen enlaces a módulos pendientes.

La home muestra Name, Email y Google Subject, incluidos valores nulos tratados como “No disponible”. Copiar Subject invoca `navigator.clipboard.writeText(user.subject)`. La API requiere contexto seguro (HTTPS o localhost) y permisos del navegador; el fallo indica cómo copiar manualmente.

Diseño responsive con fuentes del sistema, grises, blanco y acento cyan moderado. Los botones tienen focus visible y los mensajes utilizan `role="status"` o `role="alert"`. No hay datos o métricas ficticias.

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
- Tareas/notificaciones: filtros completos, lookup sin N+1, respuestas tardías descartadas, ocho estados temporales, timezone, historial activo/resuelto y ausencia de estado leído/no leído. Estas pruebas recorren el cliente API con fetch simulado; no llaman al backend real.

No hay Playwright ni snapshots de credenciales. Los tests no comparan clases Tailwind.

## Comprobación local de integración

1. Configura ambas variables en `.env`, conservando el archivo ignorado por Git.
2. Inicia el backend en su entorno habitual y verifica el certificado confiable para Node.
3. Ejecuta `pnpm dev` y abre `/login`; comprueba que aparece el botón oficial.
4. Inicia sesión con una cuenta permitida por Google y el backend.
5. Confirma redirección a `/`, Name, Email y Google Subject.
6. Usa Copiar Subject, recarga y confirma restauración.
7. Cierra sesión y confirma `/login`; la home no debe mostrar identidad al abrirla sin sesión.
8. Con un token rechazado por el backend, confirma 401, eliminación y mensaje seguro.
9. Crea un cliente en `/clients` y un proyecto en `/projects/new`; confirma la navegación al detalle.
10. Envía a Presupuestos tras confirmar; verifica PrepareQuotation Pendiente/Sin iniciar y vencimiento sin fecha.
11. Asigna SG001; comprueba SG, tarea En curso, inicio/vencimiento reales y notificaciones. Corrige a otro SG disponible y verifica que inicio/vencimiento se conservan según backend.
12. En `/tasks`, selecciona Presupuestos y el estado correspondiente; comprueba el proyecto y su enlace. Revisa `/notifications` y el historial del proyecto, incluidas alertas resueltas. Verifica navegación móvil y desktop.

Sin las dos variables y un backend activo, un 200 de la página solo verifica que Next sirve la UI. Los tests del puente con fetch mock no prueban la integración .NET ni Google real. No confundas esos resultados.

## Límites y siguiente bloque

Frontend 2B implementa clientes, proyectos, envío a Presupuestos, asignación/corrección de SG, tareas y notificaciones. Termina antes de upload/preview XLSX, edición/confirmación de cotizaciones y revisión comercial. No implementa aprobación/pago, roles, permisos simulados ni cálculos de negocio. El backend sigue siendo la autoridad. Frontend 2C requiere una instrucción explícita.

Mantener actualizados ambos README cuando cambie el comportamiento. `.gitignore` excluye `.env`, `.env.local`, `.env.*.local`, node_modules, .next, coverage, logs y el almacén local de pnpm. No incluir valores reales en documentación o tests.

Referencias: [Next.js instalación](https://nextjs.org/docs/app/getting-started/installation), [variables de entorno](https://nextjs.org/docs/app/guides/environment-variables), [React OAuth Google](https://github.com/MomenSherif/react-oauth). Para la versión instalada consulta también `node_modules/next/dist/docs/`.
