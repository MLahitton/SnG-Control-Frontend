import type { BudgetEconomics } from "./economics";
export function BudgetEconomicsNotice({ economics }: { economics?: BudgetEconomics }) {
  const status = economics?.status;
  if (status !== "Success") {
    const detail = status === "RecalculationRequired" ? "El Excel indica que necesita recalcularse y guardarse antes de validar sus importes."
      : status === "InconsistentFormulaCache" ? "Hay valores de fórmulas que no coinciden con sus referencias guardadas."
      : status === "InvalidEconomics" ? "No se pudieron validar las celdas monetarias o sus valores guardados."
      : "No están disponibles los importes del archivo original de esta versión.";
    return <p role={status && status !== "OriginalUnavailable" ? "alert" : "status"}>Importes no disponibles. {detail} No se sustituyen por precios comerciales posteriores.</p>;
  }
  return <div><p>Importes originales del Excel de Presupuestos · COP · Solo lectura. Los ajustes técnicos no recalculan estos valores.</p>
    {economics?.mainItemTotalsDiffer && <p role="status">La suma de subtotales principales difiere del total del documento. Se conserva el total del Excel; puede incluir otros conceptos. Revise el archivo original.</p>}</div>;
}
