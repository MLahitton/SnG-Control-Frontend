# SnG Control Frontend

Frontend de Steel & Glass. El bloque actual ofrece acceso con Google, un shell operativo protegido y una pantalla de identidad validada por SnG-Control-Backend.

## Estado funcional

- Inicio de sesión con el botón oficial de Google Identity Services.
- Durante desarrollo se permite cualquier cuenta Google válida que el backend acepte, sin restricciones de dominio, roles ni permisos en el frontend. La configuración de audiencia y usuarios de prueba del proyecto Google también debe permitir esa cuenta.
- Google entrega un ID Token. El backend .NET valida ese token y devuelve Subject, Email y Name.
- El shell incluye navegación responsive, nombre/email y cierre de sesión. Solo existe el enlace Inicio: no hay módulos vacíos ni métricas ficticias.
- Inicio muestra la identidad confirmada y permite copiar el Google Subject. El login permanece fuera del shell.
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

La home continúa siendo una pantalla de identidad. La infraestructura ya soporta JSON, upload multipart de XLSX y descarga binaria mediante un BFF controlado y un cliente API tipado; no inicia descargas automáticamente.

Todavía no hay interfaces de Clientes, Proyectos, Tareas, Notificaciones, Presupuestos ni Comercial, ni roles o permisos inventados en frontend. Los estados de negocio y la autorización pertenecen al backend. Este bloque termina en Frontend 2A.

La integración real requiere un Client ID configurado y un backend disponible con TLS confiable. El procedimiento de comprobación está en el manual técnico.
