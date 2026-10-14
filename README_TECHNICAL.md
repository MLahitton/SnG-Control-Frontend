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

`test` abre modo watch; `test:run` ejecuta una sola vez. `start` requiere un build previo. El lint falla también ante warnings. Los tests no requieren Internet, Google real ni el backend. En entornos Windows restringidos, Vitest y Next necesitan permiso para crear sus procesos de compilación.

## Estructura

```text
src/
  app/
    api/auth/me/route.ts
    login/page.tsx
    globals.css
    layout.tsx
    page.tsx
  features/auth/
    components/
      AuthGate.tsx
      GoogleSignInButton.tsx
      UserIdentityCard.tsx
    context/AuthProvider.tsx
    hooks/useAuth.ts
    services/authService.ts
    types/auth.ts
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
```

La raíz contiene `.env.example`, `.gitignore`, `AGENTS.md`, ambos README, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs` y `vitest.config.mts`. Next genera `next-env.d.ts` y `.next/`, ignorados por Git. `AGENTS.md` es generado por Next y remite a su documentación local.

App Router define las páginas y el Route Handler. El layout envuelve las páginas con AuthProvider. La sesión usa APIs del navegador en componentes cliente; no hay middleware ni intento de autenticación SSR con `sessionStorage`. AuthGate solo controla la presentación: la seguridad de las operaciones de API continúa en el backend.

## Configuración

Copia `.env.example` a `.env.local` en la raíz, junto a `package.json`.

| Variable | Visibilidad | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Pública, incluida en el bundle | OAuth Client ID de una aplicación web Google |
| `SNG_API_BASE_URL` | Solo servidor | URL absoluta HTTP/HTTPS de SnG-Control-Backend |

No hay valores reales ni fallback de backend. El Client ID identifica la aplicación y es público; no es una contraseña. Este flujo NO usa Client Secret. No se debe solicitar, almacenar ni añadir al entorno frontend.

El Client ID se valida antes de montar GoogleOAuthProvider. Si falta, el login queda deshabilitado: desarrollo muestra el nombre de la clave que falta y producción muestra un mensaje seguro. Nunca muestra el valor. Es posible compilar sin configuración, pero el acceso no estará operativo. Define el Client ID antes del build de un entorno utilizable: Next incorpora las variables públicas durante la compilación; cambiarlo exige recompilar o reiniciar dev.

`server-env.ts` importa `server-only` para impedir su uso desde el cliente. Valida `SNG_API_BASE_URL` cuando se solicita el puente; rechaza protocolos ajenos a HTTP/HTTPS, credenciales en la URL, query y fragmento. El endpoint siempre es `/api/auth/me` desde la raíz del origen configurado, aunque la URL tenga un path. Una configuración inválida devuelve 503 seguro y un diagnóstico de servidor que solo nombra la clave.

## Configuración de Google

Usa un OAuth Client ID de tipo aplicación web y registra el origen exacto del frontend en Authorized JavaScript origins, incluyendo esquema y puerto. Para desarrollo con el puerto habitual: `http://localhost:3000`. Si Next elige otro puerto, registra ese origen o libera el puerto esperado.

La audiencia aceptada por el backend debe corresponder al Client ID del frontend. La audiencia y usuarios de prueba de Google deben permitir la cuenta con la que se prueba. No hay filtro de dominio en la aplicación.

Se utiliza `GoogleOAuthProvider` con `GoogleLogin` de `@react-oauth/google`. `onSuccess` recibe `credential`, el Google ID Token, y lo entrega a `signIn`. No se utiliza `useGoogleLogin`, access-token flow, OAuth manual ni `gapi.auth2`. One Tap y selección automática están desactivados. El idioma del botón oficial lo determina Google. Los fallos de carga del SDK y del acceso muestran mensajes accesibles.

## Sesión y estado

`AuthProvider` mantiene `status` (`loading`, `authenticated`, `unauthenticated`), `user`, `error`, `signIn(idToken)` y `logout()`. `useAuth` expone ese contexto y exige estar dentro del proveedor.

1. Al montar, lee únicamente `sessionStorage["sng.google.id_token"]`.
2. Sin token: pasa a no autenticado.
3. Con token: llama al servicio y mantiene loading hasta la respuesta.
4. Un 200 con identidad válida activa la sesión.
5. Un 401 limpia token e identidad.
6. Ante fallo temporal, también limpia el token, muestra error y requiere un nuevo acceso. No simula una sesión válida ni reintenta en bucle.

Al iniciar sesión se limpia cualquier token anterior y se valida el nuevo. Solo tras un 200 válido se guarda el token. Si el navegador bloquea el almacenamiento, se muestra un error y no se declara autenticación exitosa.

No se persisten email, name ni subject; se recuperan del backend en cada restauración. No se lee `exp` ni ningún claim del JWT. No hay refresh tokens, cookies de autenticación ni sesión server-side.

Logout aborta validaciones pendientes, borra el token, limpia la identidad y redirige a `/login` sin llamar al backend. Las respuestas tardías de operaciones abortadas no pueden reactivar una sesión. Si el navegador deniega la eliminación del almacenamiento, el estado local se limpia y se muestra un error; no se puede garantizar un borrado que el navegador rechaza. No se revoca ni se cierra globalmente la cuenta Google.

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

Es un puente específico, no un proxy genérico ni otro sistema de autenticación. El navegador solo llama a Next.js; no necesita CORS de .NET para este flujo. No se modificó el backend.

## TLS local

El certificado HTTPS de desarrollo del backend debe ser confiable para el proceso Node que ejecuta Next, además del navegador. Si falla la confianza, corrige el certificado o el trust store apropiado y repite el smoke.

No se desactiva validación TLS global ni por request. No se usan agentes que acepten cualquier certificado. Un error TLS se trata como 502 seguro; no demuestra que Google haya rechazado la identidad.

## UI y accesibilidad

`/login` presenta SnG Control, Steel & Glass, el botón oficial y estados de carga/error; una sesión validada redirige a `/`.

`AuthGate` muestra loading, redirige no autenticados a `/login` y renderiza children únicamente con sesión validada.

La home muestra Name, Email y Google Subject, incluidos valores nulos tratados como “No disponible”. Copiar Subject invoca `navigator.clipboard.writeText(user.subject)`. La API requiere contexto seguro (HTTPS o localhost) y permisos del navegador; el fallo indica cómo copiar manualmente.

Diseño responsive con fuentes del sistema, grises, blanco y acento cyan moderado. Los botones tienen focus visible y los mensajes utilizan `role="status"` o `role="alert"`. No hay datos o métricas ficticias.

## Tests

Vitest + Testing Library + jsdom para estado y UI; entorno Node para configuración y Route Handler. Google se mockea y fetch se sustituye localmente. Las credenciales de prueba son cadenas opacas, no JWT inventados.

65 tests en seis suites verifican:
- Bearer, 200, 401, contrato JSON y errores de red/backend.
- Persistencia después de validar, restauración, errores de almacenamiento y logout.
- Strict Mode y respuestas tardías después de cerrar sesión.
- Ausencia de uso de localStorage y de renderizado de tokens.
- Identidad, Clipboard API, valores nulos y feedback accesible.
- AuthGate, redirecciones, login y callbacks de Google sin Internet.
- Configuración pública/servidor y puente: ruta fija, headers, timeout, no caché, no redirects y saneamiento de respuestas.

No hay Playwright ni snapshots de credenciales. Los tests no comparan clases Tailwind.

## Comprobación local de integración

1. Configura ambas variables en `.env.local`.
2. Inicia el backend en su entorno habitual y verifica el certificado confiable para Node.
3. Ejecuta `pnpm dev` y abre `/login`; comprueba que aparece el botón oficial.
4. Inicia sesión con una cuenta permitida por Google y el backend.
5. Confirma redirección a `/`, Name, Email y Google Subject.
6. Usa Copiar Subject, recarga y confirma restauración.
7. Cierra sesión y confirma `/login`; la home no debe mostrar identidad al abrirla sin sesión.
8. Con un token rechazado por el backend, confirma 401, eliminación y mensaje seguro.

Sin las dos variables y un backend activo, un 200 de la página solo verifica que Next sirve la UI. Los tests del puente con fetch mock no prueban la integración .NET ni Google real. No confundas esos resultados.

## Límites y siguiente bloque

No hay roles, RBAC, permisos, restricciones de dominio, entidades de usuario/empleado, proyectos, tareas, cotizaciones ni dashboard de negocio. `CommercialHeadSubject` se agregará posteriormente; actualmente solo se obtiene el Subject validado.

Mantener actualizados ambos README cuando cambie el comportamiento. `.gitignore` excluye entornos locales, node_modules, .next, coverage, logs y el almacén local de pnpm, y permite versionar `.env.example`.

Referencias: [Next.js instalación](https://nextjs.org/docs/app/getting-started/installation), [variables de entorno](https://nextjs.org/docs/app/guides/environment-variables), [React OAuth Google](https://github.com/MomenSherif/react-oauth). Para la versión instalada consulta también `node_modules/next/dist/docs/`.
