"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import type { ProjectTask } from "@/features/tasks/types";
import { ApiError } from "@/lib/api/apiError";
import { useResource } from "@/lib/api/useResource";
import { formatDate } from "@/lib/formatDate";
import { BudgetQuotationEditor } from "./BudgetQuotationEditor";
import { budgetQuotationService } from "./service";
import { quotationError } from "./validation";
import { valueFields } from "./parser";
import styles from "./BudgetQuotation.module.css";

export function BudgetQuotationPanel({ projectId, canEdit, disabled, reviewStatus, onBusyChange, onTasksUpdated, onRefreshRelated, readView }: {
  readView?: ReactNode;
  projectId: string; canEdit: boolean; disabled: boolean; reviewStatus?: ProjectTask["status"];
  onBusyChange: (busy: boolean) => void; onTasksUpdated: (tasks: ProjectTask[]) => void;
  onRefreshRelated: (signal: AbortSignal) => Promise<void>;
}) {
  const api = useApiClient();
  const load = useCallback((signal: AbortSignal) => budgetQuotationService.getStatus(api, projectId, signal), [api, projectId]);
  const status = useResource(load);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [refreshError, setRefreshError] = useState<unknown>();
  const [sent, setSent] = useState(false);
  const [confirmed, setConfirmed] = useState<{ adjusted: number } | null>(null);
  const operation = useRef<AbortController | null>(null);
  const locked = useRef(false);
  useEffect(() => () => { operation.current?.abort(); onBusyChange(false); }, [onBusyChange]);
  const current = status.data;

  async function refreshRelated(signal: AbortSignal) {
    try { await onRefreshRelated(signal); }
    catch (failure) { if (!signal.aborted) setRefreshError(failure); }
  }
  async function send() {
    if (locked.current || disabled || !confirmSend || !current?.canSendToCommercial || sent) return;
    locked.current = true; setSending(true); onBusyChange(true); setError(undefined); setRefreshError(undefined);
    const controller = new AbortController(); operation.current = controller;
    try {
      const response = await budgetQuotationService.sendToCommercial(api, projectId, controller.signal);
      if (controller.signal.aborted) return;
      setSent(true); setConfirmSend(false);
      onTasksUpdated([response.budgetTask, response.commercialTask]);
      status.refresh(); await refreshRelated(controller.signal);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure); setConfirmSend(false);
      if (failure instanceof ApiError && failure.status === 409) { status.refresh(); await refreshRelated(controller.signal); }
    } finally {
      if (!controller.signal.aborted) { locked.current = false; setSending(false); onBusyChange(false); }
    }
  }
  async function retryRelated() {
    if (locked.current) return;
    operation.current?.abort();
    const controller = new AbortController(); operation.current = controller;
    setRefreshError(undefined); await refreshRelated(controller.signal);
  }
  return <section className={styles.panel} aria-labelledby="budget-quotation-title">
    <h2 id="budget-quotation-title" className={styles.title}>Cotización de Presupuestos</h2>
    {sent && <p role="status" className="success-notice">Cotización enviada a Comercial.</p>}
    {confirmed && !sent && <p role="status" className="success-notice">Cotización de Presupuestos confirmada.</p>}
    {!!confirmed?.adjusted && <p>{confirmed.adjusted === 1 ? "1 ítem fue ajustado" : `${confirmed.adjusted} ítems fueron ajustados`} antes de confirmar.</p>}
    {sending && <p role="status">Enviando cotización a Comercial…</p>}
    {!!error && <p role="alert" className="error-message">{quotationError(error)}</p>}
    {!!refreshError && <div role="alert" className="error-message"><p>No se pudo actualizar toda la actividad del proyecto.</p><p>{quotationError(refreshError)}</p><button className="button-secondary" onClick={() => void retryRelated()}>Actualizar actividad</button></div>}
    {status.loading && <p role="status">Consultando estado de cotización…</p>}
    {!!status.error && <div role="alert" className="error-message"><p>{quotationError(status.error)}</p><button className="button-secondary" onClick={status.refresh}>Actualizar estado</button></div>}
    {current?.status === "NotConfirmed" && !confirmed && !sent && (canEdit
      ? <BudgetQuotationEditor projectId={projectId} disabled={disabled} onBusyChange={onBusyChange} onConfirmed={(response) => {
        setConfirmed({ adjusted: response.items.filter((item) => valueFields.some((field) => item.extracted[field] !== item.confirmed[field])).length });
        onTasksUpdated([response.prepareQuotationTask]); status.refresh();
      }} />
      : <p role="status">Cotización sin confirmar. La preparación debe estar en curso y tener SG para cargar el archivo.</p>)}
    {current && current.status !== "NotConfirmed" && <div className={styles.stack}>
      <p role="status" className="success-notice">{current.status === "SentToCommercial" ? "Enviada a Comercial" : "Cotización confirmada"}</p>
      <dl className={styles.summary}>
        <div><dt>Versión</dt><dd>{current.versionNumber}</dd></div><div><dt>Fecha de confirmación</dt><dd>{formatDate(current.confirmedAt)}</dd></div>
        <div><dt>Cantidad de ítems</dt><dd>{current.itemCount}</dd></div><div><dt>Cantidad total</dt><dd>{current.totalQuantity}</dd></div>
      </dl>
      {readView}
      {current.status === "SentToCommercial" ? <p>La preparación de Presupuestos finalizó. {reviewStatus === "Completed" ? "La revisión Comercial ya finalizó." : reviewStatus === "InProgress" ? "La cotización se encuentra ahora en revisión Comercial." : "La cotización fue entregada a Comercial."}</p> : <>
        <p>La cotización quedó confirmada. El proyecto continúa en Presupuestos hasta enviarlo a Comercial.</p>
        {current.sendBlockReason === "SgChangedAfterConfirmation" && <div role="alert" className="error-message">
          <p>La cotización fue confirmada con un SG diferente al SG actual del proyecto. No puede enviarse a Comercial hasta resolver esta inconsistencia.</p>
          {current.documentSgCode && <p>SG cotización: {current.documentSgCode}</p>}{current.currentProjectSgCode && <p>SG proyecto: {current.currentProjectSgCode}</p>}
        </div>}
        {current.sendBlockReason === "InvalidState" && <p role="alert" className="error-message">La cotización está confirmada, pero el estado actual del proyecto no permite enviarla a Comercial.</p>}
        {current.canSendToCommercial && !sent && <>
          <p>La cotización está lista para continuar a Comercial.</p>
          {confirmSend ? <div role="group" aria-label="Confirmar envío a Comercial" className={styles.stack}>
            <p>¿Confirmas el envío de esta cotización a Comercial? Esta acción finalizará la tarea de Presupuestos e iniciará la revisión del Jefe Comercial.</p>
            <div className="flex flex-wrap gap-3"><button className="button-primary" disabled={sending || disabled} onClick={() => void send()}>Confirmar envío</button>
              <button className="button-secondary" disabled={sending || disabled} onClick={() => setConfirmSend(false)}>Cancelar</button></div>
          </div> : <div><button className="button-primary" disabled={sending || disabled} onClick={() => setConfirmSend(true)}>Enviar a Comercial</button></div>}
        </>}
        {!current.canSendToCommercial && <div><button className="button-secondary" disabled={sending || disabled} onClick={() => { setConfirmSend(false); status.refresh(); }}>Actualizar</button></div>}
      </>}
    </div>}
  </section>;
}
