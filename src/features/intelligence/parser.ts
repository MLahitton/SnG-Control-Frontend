import type { DocumentSource, ComparedProject, Coverage, AreaItem, EntityItem, IntelligenceReference, IntelligenceResponse, IntelligenceSession, IntelligenceVoiceResponse, Metric, ProjectItem, TaskItem } from "./types";

export class IntelligenceContractError extends Error {
  constructor() { super("Intelligence devolvió una respuesta no compatible. Intenta de nuevo."); }
}
const fail = (): never => { throw new IntelligenceContractError(); };
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail();
}
function string(value: unknown, max = 500): string {
  return typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ? value : fail();
}
function nullable(value: unknown): string | null { return value === null ? null : string(value); }
function id(value: unknown): string {
  const text = string(value, 36);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : fail();
}
function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fail();
}
function array<T>(value: unknown, parse: (item: unknown) => T, max = 50): T[] {
  return Array.isArray(value) && value.length <= max ? value.map(parse) : fail();
}
function metric(value: unknown): Metric {
  const v = object(value); return { key: string(v.key), label: string(v.label), value: count(v.value) };
}
function project(value: unknown): ProjectItem {
  const v = object(value);
  if (v.kind !== "project") return fail();
  return { kind: "project", projectId: id(v.projectId), projectName: string(v.projectName), sgCode: nullable(v.sgCode), clientName: nullable(v.clientName), city: nullable(v.city) };
}
function task(value: unknown): TaskItem {
  const v = object(value);
  if (v.kind !== "task") return fail();
  const deadlineAt = nullable(v.deadlineAt);
  if (deadlineAt !== null && (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(deadlineAt) || !Number.isFinite(Date.parse(deadlineAt)))) return fail();
  return { kind: "task", projectId: id(v.projectId), projectName: string(v.projectName), sgCode: nullable(v.sgCode), taskId: id(v.taskId), area: nullable(v.area), task: nullable(v.task), status: nullable(v.status), leakTimeStatus: nullable(v.leakTimeStatus), deadlineAt };
}
function documentSource(value: unknown): DocumentSource {
  const v = object(value), uploadedAt = string(v.uploadedAt);
  if (v.kind !== "document" || typeof v.isCurrent !== "boolean" || typeof v.inInitialHandoff !== "boolean" || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(uploadedAt) || !Number.isFinite(Date.parse(uploadedAt))) return fail();
  return { kind: "document", documentId: id(v.documentId), projectId: id(v.projectId), filename: string(v.filename), uploadedAt, isCurrent: v.isCurrent, inInitialHandoff: v.inInitialHandoff,
    ...(v.sizeBytes !== undefined ? { sizeBytes: count(v.sizeBytes) } : {}),
    ...(v.replacedByDocumentId !== undefined ? { replacedByDocumentId: v.replacedByDocumentId === null ? null : id(v.replacedByDocumentId) } : {}) };
}
function entity(value: unknown): EntityItem { return object(value).kind === "document" ? documentSource(value) : object(value).kind === "project" ? project(value) : task(value); }
function area(value: unknown): AreaItem {
  const v = object(value); return { area: nullable(v.area), pending: count(v.pending), inProgress: count(v.inProgress), completed: count(v.completed), overdue: count(v.overdue), dueToday: count(v.dueToday), dueSoon: count(v.dueSoon) };
}
function coverage(value: unknown): Coverage | null {
  if (value === null) return null;
  const v = object(value), total = count(v.total), returned = count(v.returned);
  if (returned > total || typeof v.hasMore !== "boolean" || v.hasMore !== (total > returned)) return fail();
  return { total, returned, hasMore: v.hasMore };
}
function comparedProject(value: unknown): ComparedProject {
  const v = object(value), item = project(v.project), tasks = array(v.tasks, task);
  if (tasks.some((t) => t.projectId !== item.projectId)) return fail();
  return { project: item, metrics: array(v.metrics, metric), tasks };
}
function comparedProjects(value: unknown): ComparedProject[] {
  const projects = array(value, comparedProject, 4);
  if (projects.length === 1 || new Set(projects.map((p) => p.project.projectId)).size !== projects.length) return fail();
  return projects;
}
function reference(value: unknown): IntelligenceReference {
  const v = object(value);
  const base = { projectId: id(v.projectId), label: string(v.label) };
  if (v.type === "project") return { ...base, type: "project", sgCode: nullable(v.sgCode) };
  if (v.type === "task") return { ...base, type: "task", taskId: id(v.taskId) };
  if (v.type === "document") return { ...base, type: "document", documentId: id(v.documentId) };
  return fail();
}
export function parseResponse(value: unknown): IntelligenceResponse {
  const v = object(value), p = object(v.presentation);
  if (p.kind !== v.responseType) return fail();
  const base = { answer: string(v.answer, 12000), spokenAnswer: string(v.spokenAnswer, 12000), references: array(v.references, reference) };
  switch (v.responseType) {
    case "direct": return { ...base, responseType: "direct", presentation: { kind: "direct", metric: p.metric === null ? null : metric(p.metric) } };
    case "management_brief": return { ...base, responseType: "management_brief", presentation: { kind: "management_brief", metrics: array(p.metrics, metric), items: array(p.items, entity), ...(p.areas !== undefined ? { areas: array(p.areas, area) } : {}), ...(p.attentionCoverage !== undefined ? { attentionCoverage: coverage(p.attentionCoverage) } : {}), ...(p.tasksCoverage !== undefined ? { tasksCoverage: coverage(p.tasksCoverage) } : {}) } };
    case "project_status": return { ...base, responseType: "project_status", presentation: { kind: "project_status", project: project(p.project), tasks: array(p.tasks, task) } };
    case "list": return { ...base, responseType: "list", presentation: { kind: "list", items: array(p.items, entity) } };
    case "comparison": {
      const areas = array(p.areas, area), projects = p.projects === undefined ? undefined : comparedProjects(p.projects);
      if (areas.length && projects?.length) return fail();
      return { ...base, responseType: "comparison", presentation: { kind: "comparison", areas, ...(projects !== undefined ? { projects } : {}) } };
    }
    case "document_analysis": {
      const main = project(p.project), related = p.relatedProjects === undefined ? [] : array(p.relatedProjects, project, 3), sources = array(p.sources, documentSource, 4);
      const projects = [main, ...related].map((item) => item.projectId);
      if (!sources.length || new Set(projects).size !== projects.length || new Set(sources.map((s) => s.documentId)).size !== sources.length || sources.some((s) => !projects.includes(s.projectId))) return fail();
      return { ...base, responseType: "document_analysis", presentation: { kind: "document_analysis", project: main, sources, ...(p.relatedProjects !== undefined ? { relatedProjects: related } : {}) } };
    }
    case "clarification": return { ...base, responseType: "clarification", presentation: { kind: "clarification", candidates: array(p.candidates, project), ...(p.documents !== undefined ? { documents: array(p.documents, documentSource) } : {}) } };
    case "unavailable":
      if (p.reason !== "data_not_available") return fail();
      return { ...base, responseType: "unavailable", presentation: { kind: "unavailable", reason: "data_not_available" } };
    default: return fail();
  }
}
export function parseTranscript(value: unknown): { transcript: string } {
  const transcript = string(object(value).transcript, 4000);
  return transcript.trim() ? { transcript } : fail();
}
export function parseVoice(value: unknown): IntelligenceVoiceResponse { return { ...parseResponse(value), ...parseTranscript(value) }; }
export function parseSession(value: unknown): IntelligenceSession {
  const v = object(value);
  return v.authenticated === true && v.isManagement === true ? { authenticated: true, isManagement: true } : fail();
}
