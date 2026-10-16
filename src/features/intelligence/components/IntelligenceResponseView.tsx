import Link from "next/link";
import { formatDate } from "@/lib/formatDate";
import type { EntityItem, IntelligencePresentation, IntelligenceResponse, Metric } from "../types";
import styles from "./Intelligence.module.css";

// Intelligence already supplies localized presentation labels; do not reinterpret them as backend enums.
function Entity({ item, onNavigate }: { item: EntityItem; onNavigate: () => void }) {
  return <div className={styles.entity}>
    <Link className="text-link" href={`/projects/${encodeURIComponent(item.projectId)}`} onClick={onNavigate}>{item.projectName}</Link>
    <p className="metadata">{item.sgCode ?? "Sin SG"}</p>
    {item.kind === "project" ? <p className="metadata">{[item.clientName, item.city].filter(Boolean).join(" · ")}</p> : <>
      <p>{item.status ?? "No disponible"} · {item.area ?? "No disponible"}</p>
      <p>{item.task ?? "Tarea no disponible"}</p>
      <p className="metadata">{item.leakTimeStatus ?? "Sin información de plazo"} · {item.deadlineAt ? formatDate(item.deadlineAt) : "Sin vencimiento"}</p>
    </>}
  </div>;
}
function Metrics({ items }: { items: Metric[] }) {
  return <dl className={styles.metrics}>{items.map((metric, index) => <div key={`${metric.key}-${index}`}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl>;
}
function Presentation({ value, onAsk, onNavigate, disabled }: { value: IntelligencePresentation; onAsk: (message: string) => void; onNavigate: () => void; disabled: boolean }) {
  switch (value.kind) {
    case "direct": return value.metric ? <Metrics items={[value.metric]} /> : null;
    case "management_brief": return <><Metrics items={value.metrics} />{value.items.map((item, index) => <Entity key={index} item={item} onNavigate={onNavigate} />)}</>;
    case "project_status": return <><Entity item={value.project} onNavigate={onNavigate} />{value.tasks.map((item, index) => <Entity key={index} item={item} onNavigate={onNavigate} />)}</>;
    case "list": return <ul className={styles.entityList}>{value.items.map((item, index) => <li key={index}><Entity item={item} onNavigate={onNavigate} /></li>)}</ul>;
    case "comparison": return <div className="table-scroll" role="region" aria-label="Comparación por área" tabIndex={0}><table className="data-table"><thead><tr>{["Área", "Pendientes", "En curso", "Completadas", "Atrasadas", "Hoy", "Próximas"].map((text) => <th scope="col" key={text}>{text}</th>)}</tr></thead><tbody>{value.areas.map((area, index) => <tr key={index}><th scope="row">{area.area ?? "No disponible"}</th><td>{area.pending}</td><td>{area.inProgress}</td><td>{area.completed}</td><td>{area.overdue}</td><td>{area.dueToday}</td><td>{area.dueSoon}</td></tr>)}</tbody></table></div>;
    case "clarification": return <ul className={styles.entityList}>{value.candidates.map((item, index) => <li key={index}><button type="button" className={styles.candidate} aria-label={`Consultar ${item.projectName}`} disabled={disabled} onClick={() => onAsk(`¿Cómo va el proyecto "${item.projectName}" (ID ${item.projectId})?`)}><span>{item.projectName}</span><span className="metadata">{item.sgCode ?? "Sin SG"}{item.city ? ` · ${item.city}` : ""}</span></button></li>)}</ul>;
    case "unavailable": return null;
  }
}
export function IntelligenceResponseView({ response, onAsk, onNavigate, disabled = false }: { response: IntelligenceResponse; onAsk: (message: string) => void; onNavigate: () => void; disabled?: boolean }) {
  return <div className={styles.response}>
    <p className={styles.answer}>{response.answer}</p>
    <Presentation value={response.presentation} onAsk={onAsk} onNavigate={onNavigate} disabled={disabled} />
    {response.references.length > 0 && <nav aria-label="Referencias de la respuesta"><ul className={styles.references}>{response.references.map((reference, index) => <li key={index}><Link className="text-link" href={`/projects/${encodeURIComponent(reference.projectId)}`} onClick={onNavigate}>{reference.label}</Link>{reference.type === "project" && reference.sgCode && <span className="metadata">{reference.sgCode}</span>}</li>)}</ul></nav>}
  </div>;
}
