# SnG Control Frontend

Frontend de Steel & Glass. El bloque actual ofrece acceso con Google y una pantalla de identidad validada por SnG-Control-Backend.

## Estado funcional

- Inicio de sesión con el botón oficial de Google Identity Services.
- Durante desarrollo se permite cualquier cuenta Google válida que el backend acepte, sin restricciones de dominio, roles ni permisos en el frontend. La configuración de audiencia y usuarios de prueba del proyecto Google también debe permitir esa cuenta.
- Google entrega un ID Token. El backend .NET valida ese token y devuelve Subject, Email y Name.
- La pantalla inicial muestra únicamente la identidad confirmada, permite copiar el Google Subject y cerrar sesión.
- El token se guarda en `sessionStorage` en la pestaña actual, después de una validación exitosa. No se guardan los datos de identidad como autoridad separada.
- Al recargar, la identidad se consulta otra vez al backend. Mientras se verifica, no se muestra contenido autenticado.
- Una respuesta 401 limpia la sesión y permite iniciar sesión nuevamente. Un fallo temporal también cierra la sesión local y muestra un error; es necesario reintentar el acceso.
- Cerrar sesión elimina el token y la identidad local y vuelve a `/login`. No cierra la cuenta Google globalmente.

La sesión está limitada a la sesión de página del navegador. Normalmente termina al cerrar la pestaña; duplicar pestañas o restaurar una sesión del navegador puede conservar una copia según el navegador. Cada restauración exige validación del backend. No hay renovación automática del token.

## Ejecutar

Se requiere Node.js 24 y pnpm 11.5.0. Consulta [README_TECHNICAL.md](README_TECHNICAL.md) para la configuración de Google, backend y TLS.

```powershell
pnpm install
Copy-Item .env.example .env.local
```

Completa las dos variables de `.env.local` con tu configuración, luego ejecuta:

```powershell
pnpm dev
```

Abre la URL local que imprime Next.js y entra a `/login`. No se incluyen credenciales reales.

## Alcance actual

La home es una pantalla de identidad, no un dashboard de negocio. Todavía no existen CommercialHead, roles, permisos, usuarios persistidos, proyectos, cotizaciones, tareas, métricas ni navegación por áreas. El Subject se muestra para una configuración futura; `CommercialHeadSubject` aún no se implementa.

La integración real requiere un Client ID configurado y un backend disponible con TLS confiable. El procedimiento de comprobación está en el manual técnico.
