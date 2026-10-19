// Public contract observed in Intelligence Presentation & Voice 1B.
// Keep wire-contract changes here and in parser.ts.
export type IntelligenceResponseType = "direct" | "management_brief" | "project_status" | "list" | "comparison" | "clarification" | "unavailable";
export interface Metric { key: string; label: string; value: number }
export interface ProjectItem { kind: "project"; projectId: string; projectName: string; sgCode: string | null; clientName: string | null; city: string | null }
export interface TaskItem { kind: "task"; projectId: string; projectName: string; sgCode: string | null; taskId: string; area: string | null; task: string | null; status: string | null; leakTimeStatus: string | null; deadlineAt: string | null }
export type EntityItem = ProjectItem | TaskItem;
export interface AreaItem { area: string | null; pending: number; inProgress: number; completed: number; overdue: number; dueToday: number; dueSoon: number }
export interface Coverage { total: number; returned: number; hasMore: boolean }
export interface ComparedProject { project: ProjectItem; metrics: Metric[]; tasks: TaskItem[] }
export interface PresentationMap {
  direct: { kind: "direct"; metric: Metric | null };
  management_brief: { kind: "management_brief"; metrics: Metric[]; items: EntityItem[]; areas?: AreaItem[]; attentionCoverage?: Coverage | null; tasksCoverage?: Coverage | null };
  project_status: { kind: "project_status"; project: ProjectItem; tasks: TaskItem[] };
  list: { kind: "list"; items: EntityItem[] };
  comparison: { kind: "comparison"; areas: AreaItem[]; projects?: ComparedProject[] };
  clarification: { kind: "clarification"; candidates: ProjectItem[] };
  unavailable: { kind: "unavailable"; reason: "data_not_available" };
}
export type IntelligencePresentation = PresentationMap[IntelligenceResponseType];
export type IntelligenceReference =
  | { type: "project"; projectId: string; label: string; sgCode: string | null }
  | { type: "task"; projectId: string; taskId: string; label: string };
export type IntelligenceResponse = { [K in IntelligenceResponseType]: {
  responseType: K; answer: string; spokenAnswer: string; references: IntelligenceReference[]; presentation: PresentationMap[K];
} }[IntelligenceResponseType];
export type IntelligenceVoiceResponse = IntelligenceResponse & { transcript: string };
export interface IntelligenceSession { authenticated: true; isManagement: true }
export type Message =
  | { id: number; role: "user"; content: string; state: "sending" | "complete" | "error" }
  | { id: number; role: "assistant"; response: IntelligenceResponse; state: "complete" };
export const MAX_MESSAGE_CHARACTERS = 4000;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDING_SECONDS = 60;
