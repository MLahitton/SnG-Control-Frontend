import { forwardBackend } from "@/lib/api/backendBridge";

export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  return forwardBackend(request, path);
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };

// Next otherwise derives HEAD from GET. Do not forward unsupported methods.
export function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET, POST, PUT", "Cache-Control": "no-store" } });
}
