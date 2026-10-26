import type { ApiClient } from "@/lib/api/types";
import { ApiError } from "@/lib/api/apiError";
import { parseBudgetView, parseCommercialView } from "./contracts";

async function read<T>(api: ApiClient, projectId: string, kind: string, parse: (v: unknown, id: string) => T, signal: AbortSignal): Promise<T | null> {
  try { return parse(await api.get<unknown>(`projects/${projectId}/${kind}-quotation/view`, { signal }), projectId); }
  catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
}
export const quotationViewService = {
  budget: (api: ApiClient, id: string, signal: AbortSignal) => read(api, id, "budget", parseBudgetView, signal),
  commercial: (api: ApiClient, id: string, signal: AbortSignal) => read(api, id, "commercial", parseCommercialView, signal),
  image: async (api: ApiClient, id: string, itemId: string, signal: AbortSignal) => {
    const { blob } = await api.download(`projects/${id}/budget-quotation/items/${itemId}/image`, { signal });
    if (!["image/png", "image/jpeg", "image/gif", "image/bmp", "image/tiff"].includes(blob.type)) throw new ApiError(502);
    return blob;
  },
};
