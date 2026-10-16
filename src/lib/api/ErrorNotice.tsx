import { ApiError } from "./apiError";

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "No pudimos completar la operación. Intenta de nuevo.";
}

export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  return <div role="alert" className="error-message">
    <p>{errorMessage(error)}</p>
    {error instanceof ApiError && error.code && <p className="mt-1 text-xs">Código: {error.code}</p>}
    {retry && <button className="button-secondary mt-3" onClick={retry}>Volver a cargar</button>}
  </div>;
}
