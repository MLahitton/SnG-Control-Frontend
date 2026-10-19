"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import type { ProjectTask } from "@/features/tasks/types";
import { formatDate } from "@/lib/formatDate";
import { budgetQuotationService } from "./service";
import { buildConfirmation, createDraft, quotationError } from "./validation";
import { valueFields } from "./parser";
import type { BudgetQuotationPreviewResponse, ConfirmedBudgetQuotationResponse, ItemDraft } from "./types";
import { BudgetQuotationPreview } from "./BudgetQuotationPreview";
import styles from "./BudgetQuotation.module.css";

export function BudgetQuotationPanel({ projectId, disabled, onBusyChange, onConfirmed }: {
  projectId: string; disabled: boolean; onBusyChange: (busy: boolean) => void; onConfirmed: (task: ProjectTask) => void;
}) {
  const api = useApiClient();
  const [file, setFile] = useState<File | null>(null);
  // File and parsed preview are a single snapshot. Confirmation never uses the selector's state.
  const [snapshot, setSnapshot] = useState<{ file: File; preview: BudgetQuotationPreviewResponse } | null>(null);
  const [draft, setDraft] = useState<ItemDraft[]>([]);
  const [confirmed, setConfirmed] = useState<ConfirmedBudgetQuotationResponse | null>(null);
  const [phase, setPhase] = useState<"preview" | "confirm" | null>(null);
  const [error, setError] = useState("");
  const operation = useRef<AbortController | null>(null);
  const locked = useRef(false);
  useEffect(() => () => { operation.current?.abort(); onBusyChange(false); }, [onBusyChange]);

  function selectFile(files: FileList | null) {
    if (locked.current || disabled) return;
    operation.current?.abort();
    setSnapshot(null); setDraft([]); setConfirmed(null); setError(""); setFile(null);
    if (!files?.length) return;
    if (files.length !== 1 || !/\.xlsx$/i.test(files[0].name)) { setError("Selecciona un solo archivo .xlsx. No se admiten .xls, .csv ni .xlsm."); return; }
    setFile(files[0]);
  }
  async function run(action: "preview" | "confirm") {
    if (locked.current || disabled || !file || confirmed) return;
    const payload = action === "confirm" && snapshot ? buildConfirmation(snapshot.preview, draft) : null;
    if (action === "confirm" && (!snapshot || !payload)) {
      setError("Revisa los ítems: el número es obligatorio, las medidas deben ser mayores que cero y la cantidad debe ser un entero positivo."); return;
    }
    locked.current = true; setPhase(action); onBusyChange(true); setError("");
    const controller = new AbortController(); operation.current = controller;
    if (action === "preview") { setSnapshot(null); setDraft([]); }
    try {
      if (action === "preview") {
        const preview = await budgetQuotationService.preview(api, projectId, file, controller.signal);
        if (controller.signal.aborted) return;
        setSnapshot({ file, preview }); setDraft(createDraft(preview));
      } else if (snapshot && payload) {
        const response = await budgetQuotationService.confirm(api, projectId, snapshot.file, payload, controller.signal);
        if (controller.signal.aborted) return;
        setConfirmed(response); setSnapshot(null); setDraft([]); setFile(null);
        onConfirmed(response.prepareQuotationTask);
      }
    } catch (failure) { if (!controller.signal.aborted) setError(quotationError(failure)); }
    finally { if (!controller.signal.aborted) { locked.current = false; setPhase(null); onBusyChange(false); } }
  }
  function submit(event: FormEvent) { event.preventDefault(); void run("confirm"); }
  const adjusted = confirmed?.items.filter((item) => valueFields.some((field) => item.extracted[field] !== item.confirmed[field])).length ?? 0;

  return <section className={styles.panel} aria-labelledby="budget-quotation-title">
    <h2 id="budget-quotation-title" className={styles.title}>Cotización de Presupuestos</h2>
    {error && <p role="alert" className="error-message">{error}</p>}
    {phase && <p role="status">{phase === "preview" ? "Generando preview…" : "Confirmando cotización…"}</p>}
    {confirmed ? <div className={styles.stack}>
      <p role="status" className="success-notice">Cotización de Presupuestos confirmada.</p>
      <dl className={styles.summary}>
        <div><dt>Versión</dt><dd>{confirmed.versionNumber}</dd></div><div><dt>Fecha</dt><dd>{formatDate(confirmed.confirmedAt)}</dd></div>
        <div><dt>Cantidad de ítems</dt><dd>{confirmed.itemCount}</dd></div><div><dt>Cantidad total</dt><dd>{confirmed.totalQuantity}</dd></div>
      </dl>
      {adjusted > 0 && <p>{adjusted === 1 ? "1 ítem fue ajustado" : `${adjusted} ítems fueron ajustados`} antes de confirmar.</p>}
      <p>La cotización quedó confirmada. El proyecto continúa en Presupuestos hasta enviarlo a Comercial.</p>
      <p>Siguiente paso: enviar a Comercial</p>
    </div> : <>
      <h3 className={styles.title}>Cargar cotización</h3>
      <p id="quotation-file-help">El archivo debe ser un Excel .xlsx con la hoja estándar COTIZACIÓN y el mismo SG del proyecto.</p>
      <label className="field-label">Seleccionar archivo<input className="form-control" type="file" accept=".xlsx" disabled={!!phase || disabled}
        aria-describedby="quotation-file-help" onChange={(e) => selectFile(e.target.files)} /></label>
      <p className={styles.note}>El preview y las correcciones se conservan solo mientras permanezcas en este proyecto. Al recargar se perderán.</p>
      <div><button className="button-secondary" disabled={!file || !!phase || disabled} onClick={() => void run("preview")}>Generar preview</button></div>
      {snapshot && <form className={styles.stack} onSubmit={submit} noValidate>
        <BudgetQuotationPreview preview={snapshot.preview} draft={draft} disabled={!!phase || disabled}
          onChange={(index, field, value) => setDraft((current) => current.map((item, i) => i === index ? { ...item, [field]: value } : item))} />
        <div><button className="button-primary" disabled={!!phase || disabled}>Confirmar cotización</button></div>
      </form>}
    </>}
  </section>;
}
