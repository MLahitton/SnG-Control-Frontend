import { forwardIntelligence } from "@/features/intelligence/server/bridge";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) { return forwardIntelligence(request, (await context.params).path); }
export const GET = handle;
export const POST = handle;
// Explicitly reject HEAD instead of Next's automatic GET fallback.
export const HEAD = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
