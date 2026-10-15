import type { CommercialItemKey, SafeProblemDetails } from "./types";

export const MAX_COMMERCIAL_ITEM_KEYS = 200;

const titles: Record<number, string> = {
  0: "No pudimos conectar con el servicio. Inténtalo de nuevo.",
  400: "Revisa los datos de la solicitud.",
  401: "Tu sesión ya no es válida. Inicia sesión de nuevo.",
  403: "No tienes permiso para esta acción.",
  404: "No se encontró el recurso solicitado.",
  405: "Esta operación no está permitida.",
  409: "La operación entra en conflicto con el estado actual.",
  413: "El archivo o la solicitud supera el tamaño permitido.",
  415: "El formato de la solicitud no está permitido.",
  429: "Hay demasiadas solicitudes. Inténtalo más tarde.",
  500: "El servicio no pudo completar la operación.",
  502: "No pudimos comunicarnos con el servicio.",
  503: "El servicio no está disponible en este momento.",
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function identifier(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value)
    ? value : undefined;
}

function commercialItemKeys(value: unknown): CommercialItemKey[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_COMMERCIAL_ITEM_KEYS) return undefined;
  const items: CommercialItemKey[] = [];
  for (const entry of value) {
    const item = record(entry);
    if ((item.section !== "Main" && item.section !== "Additional")
      || typeof item.sourceRow !== "number" || !Number.isSafeInteger(item.sourceRow)
      || item.sourceRow <= 0) return undefined;
    items.push({ section: item.section, sourceRow: item.sourceRow });
  }
  return items;
}

// Allowlisted structured metadata only. Free-form upstream diagnostics are never public.
export function safeProblem(status: number, payload?: unknown): SafeProblemDetails {
  const source = record(payload);
  const extra = record(source.extensions);
  const extensions: SafeProblemDetails["extensions"] = {};
  if (status >= 400 && status < 500) {
    for (const key of ["code", "errorCode", "field"] as const) {
      const value = identifier(source[key] ?? extra[key]);
      if (value) extensions[key] = value;
    }
    const fields = source.fields ?? extra.fields;
    if (Array.isArray(fields) && fields.length <= 50 && fields.every((value) => identifier(value))) {
      extensions.fields = fields as string[];
    }
    const retry = source.retryAfterSeconds ?? extra.retryAfterSeconds;
    if (typeof retry === "number" && Number.isSafeInteger(retry) && retry >= 0) {
      extensions.retryAfterSeconds = retry;
    }
    for (const key of ["missingItems", "unexpectedItems"] as const) {
      const items = commercialItemKeys(source[key] ?? extra[key]);
      if (items) extensions[key] = items;
    }
    const fileError = source.fileError ?? extra.fileError;
    if (typeof fileError === "string" && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(fileError)) {
      extensions.fileError = fileError;
    }
  }
  return {
    type: "about:blank",
    status,
    title: titles[status] ?? "No se pudo completar la solicitud.",
    ...(extensions.code || extensions.errorCode ? { code: extensions.code ?? extensions.errorCode } : {}),
    extensions,
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly problem: SafeProblemDetails;
  readonly missingItems?: CommercialItemKey[];
  readonly unexpectedItems?: CommercialItemKey[];
  readonly fileError?: string;

  constructor(status: number, payload?: unknown) {
    const problem = safeProblem(status, payload);
    super(problem.title);
    this.name = "ApiError";
    this.status = status;
    this.code = problem.code;
    this.problem = problem;
    this.missingItems = problem.extensions.missingItems;
    this.unexpectedItems = problem.extensions.unexpectedItems;
    this.fileError = problem.extensions.fileError;
  }
}
