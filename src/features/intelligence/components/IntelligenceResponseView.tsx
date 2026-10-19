import Link from "next/link";
import { formatDate } from "@/lib/formatDate";
import type { AreaItem, Coverage, EntityItem, IntelligencePresentation, IntelligenceResponse, Metric } from "../types";
import styles from "./Intelligence.module.css";

// Intelligence already supplies localized presentation labels; do not reinterpret them as backend enums.
function Entity({ item, onNavigate }: { item: EntityItem; onNavigate: () => void }) {
  return <div className={styles.entity}>
    <Link className="text-link" href={`/projects/${encodeURIComponent(item.projectId)}`} onClick={onNavigate}>{item.projectName}</Link>
    {item.sgCode && <p className="metadata">{item.sgCode}</p>}
    {item.kind === "project" ? <p className="metadata">{[item.clientName, item.city].filter(Boolean).join(" · ")}</p> : <>
      {(item.status || item.area) && <p>{[item.status, item.area].filter(Boolean).join(" · ")}</p>}
      {item.task && <p>{item.task}</p>}
      {(item.leakTimeStatus || item.deadlineAt) && <p className="metadata">{[item.leakTimeStatus, item.deadlineAt ? formatDate(item.deadlineAt) : null].filter(Boolean).join(" · ")}</p>}
    </>}
  </div>;
}
function Metrics({ items }: { items: Metric[] }) {
  return <dl className={styles.metrics}>{items.map((metric, index) => <div key={`${metric.key}-${index}`}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl>;
}
function SliceCoverage({ label, value }: { label: string; value?: Coverage | null }) {
  return value?.hasMore ? <p className="metadata">{label}: datos recuperados de {value.returned} de {value.total}. Hay más elementos disponibles.</p> : null;
}
function Areas({ items }: { items: AreaItem[] }) {
  if (!items.length) return null;
  return <section aria-label="Comparación por área" className={styles.comparisonGrid}>{items.map((area, index) => <article className={styles.comparisonCard} key={index} aria-label={area.area ?? "Área sin etiqueta disponible"}>
    <h4>{area.area ?? "Área sin etiqueta disponible"}</h4>
    <Metrics items={[
      { key: "pending", label: "Pendientes", value: area.pending },
      { key: "inProgress", label: "En curso", value: area.inProgress },
      { key: "completed", label: "Completadas", value: area.completed },
      { key: "overdue", label: "Atrasadas", value: area.overdue },
      { key: "dueToday", label: "Vencen hoy", value: area.dueToday },
      { key: "dueSoon", label: "Próximas a vencer", value: area.dueSoon },
    ]} />
  </article>)}</section>;
}
function Presentation({ value, onAsk, onNavigate, disabled }: { value: IntelligencePresentation; onAsk: (message: string) => void; onNavigate: () => void; disabled: boolean }) {
  switch (value.kind) {
    case "direct": return value.metric ? <Metrics items={[value.metric]} /> : null;
    case "management_brief": return <><Metrics items={value.metrics} />{value.items.map((item, index) => <Entity key={index} item={item} onNavigate={onNavigate} />)}<SliceCoverage label="Atención" value={value.attentionCoverage} /><Areas items={value.areas ?? []} /><SliceCoverage label="Tareas del resumen" value={value.tasksCoverage} /></>;
    case "project_status": return <><Entity item={value.project} onNavigate={onNavigate} />{value.tasks.map((item, index) => <Entity key={index} item={item} onNavigate={onNavigate} />)}</>;
    case "list": return <ul className={styles.entityList}>{value.items.map((item, index) => <li key={index}><Entity item={item} onNavigate={onNavigate} /></li>)}</ul>;
    case "comparison": return value.projects?.length ? <section aria-label="Comparación de proyectos" className={styles.comparisonGrid}>{value.projects.map((item) => <article className={styles.comparisonCard} key={item.project.projectId} aria-label={item.project.projectName}>
      <Entity item={item.project} onNavigate={onNavigate} />
      <Metrics items={item.metrics} />
      {item.tasks.length > 0 && <details><summary>Tareas actuales ({item.tasks.length})</summary><ul className={styles.entityList}>{item.tasks.map((task) => <li key={task.taskId}><Entity item={task} onNavigate={onNavigate} /></li>)}</ul></details>}
    </article>)}</section> : <Areas items={value.areas} />;
    case "clarification": return <ul className={styles.entityList}>{value.candidates.map((item, index) => <li key={index}><button type="button" className={styles.candidate} aria-label={`Consultar ${item.projectName}`} disabled={disabled} onClick={() => onAsk(`¿Cómo va ${item.projectName}?`)}><span>{item.projectName}</span><span className="metadata">{item.sgCode ?? "Sin SG"}{item.city ? ` · ${item.city}` : ""}</span></button></li>)}</ul>;
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
