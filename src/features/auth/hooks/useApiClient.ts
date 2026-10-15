"use client";

import { useAuth } from "./useAuth";

export function useApiClient() {
  return useAuth().apiClient;
}
