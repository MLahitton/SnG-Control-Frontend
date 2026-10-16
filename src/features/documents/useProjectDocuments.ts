"use client";
import { useCallback } from "react";
import type { ApiClient } from "@/lib/api/types";
import { useResource } from "@/lib/api/useResource";
import { documentsService } from "./service";

export function useProjectDocuments(api: ApiClient, projectId: string) {
  const load = useCallback((signal: AbortSignal) => documentsService.list(api, projectId, signal), [api, projectId]);
  return useResource(load);
}
