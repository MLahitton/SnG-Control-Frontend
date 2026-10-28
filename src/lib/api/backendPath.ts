export const backendRoots = ["clients", "projects", "project-tasks", "notifications"] as const;

export function isBackendPath(segments: string[]): boolean {
  if (segments[0] === "projects" && segments[2] === "client-quotation-decision") return segments.length === 3 && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(segments[1]);
  if (segments[0] === "projects" && segments[2] === "commercial-quotation") return isCommercialQuotationPath(segments);
  if (segments[0] === "projects" && segments[2] === "send-to-commercial") return isSendToCommercialPath(segments);
  if (segments[0] === "projects" && segments[2] === "budget-quotation") {
    return isBudgetQuotationPath(segments) || isQuotationImagePath(segments);
  }
  if (segments[0] === "management") return segments.length === 2 && ["overview", "tasks"].includes(segments[1]);
  return segments.length > 0 && segments.length <= 20
    && backendRoots.some((root) => root === segments[0])
    && segments.every((segment) => segment.length <= 200
      && /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(segment));
}

export function isBudgetQuotationPath(segments: string[]): boolean {
  return segments.length === 4 && segments[0] === "projects" && /^[A-Za-z0-9_-]{1,200}$/.test(segments[1])
    && segments[2] === "budget-quotation" && ["preview", "confirm", "status", "commercial-file", "view"].includes(segments[3]);
}

export function isCommercialQuotationPath(segments: string[]): boolean {
  return segments.length === 4 && segments[0] === "projects" && /^[A-Za-z0-9_-]{1,200}$/.test(segments[1])
    && segments[2] === "commercial-quotation" && ["preview", "confirm", "file", "view"].includes(segments[3]);
}

export function isSendToCommercialPath(segments: string[]): boolean {
  return segments.length === 3 && segments[0] === "projects" && /^[A-Za-z0-9_-]{1,200}$/.test(segments[1]) && segments[2] === "send-to-commercial";
}

export function isDocumentRemovalPath(segments: string[]): boolean {
  return isBackendPath(segments) && segments.length === 4 && segments[0] === "projects" && segments[2] === "documents";
}

export function isDocumentFilePath(segments: string[]): boolean {
  return isBackendPath(segments) && segments.length === 5 && segments[0] === "projects" && segments[2] === "documents" && segments[4] === "file";
}

export function isLargeDocumentTransfer(method: string, segments: string[]): boolean {
  if (!isBackendPath(segments) || segments[0] !== "projects" || segments[2] !== "documents") return false;
  return (method === "POST" && segments.length === 4 && segments[3] === "batch")
    || (method === "GET" && (isDocumentFilePath(segments)
      || (segments.length === 4 && ["current.zip", "initial-handoff.zip"].includes(segments[3]))));
}

export function isQuotationImagePath(segments: string[]): boolean {
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return segments.length === 6 && segments[0] === "projects" && guid.test(segments[1])
    && segments[2] === "budget-quotation" && segments[3] === "items" && guid.test(segments[4]) && segments[5] === "image";
}
