import { roleContext } from "./roleFixtures";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IntelligenceResponseView } from "@/features/intelligence/components/IntelligenceResponseView";
import { IntelligenceLauncher } from "@/features/intelligence/components/IntelligenceLauncher";
import { AuthContext } from "@/features/auth/context/AuthProvider";
import { createApiClient } from "@/lib/api/apiClient";
import { parseResponse } from "@/features/intelligence/parser";
import type { IntelligenceResponse } from "@/features/intelligence/types";
import { intelligenceProject, intelligenceTask, projectId, conversationCreated } from "./intelligenceFixtures";
import { token } from "./fixtures";
import { manager } from "./managementFixtures";
import { liveCreated } from "./liveFixtures";
import { LivePeer, mockLiveBrowser } from "./liveBrowser";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const secondId = "44444444-4444-4444-8444-444444444444";
const comparison: IntelligenceResponse = {
  responseType: "comparison", answer: "Ambos proyectos tienen una tarea pendiente.", spokenAnswer: "Ambos proyectos tienen una tarea pendiente.",
  references: [
    { type: "project", projectId, label: "Casa Ximena", sgCode: "SG001" },
    { type: "project", projectId: secondId, label: "Proyecto Segundo", sgCode: null },
  ],
  presentation: { kind: "comparison", areas: [], projects: [
    { project: intelligenceProject, metrics: [{ key: "tasks.Pending", label: "Pendientes", value: 1 }], tasks: [intelligenceTask] },
    { project: { ...intelligenceProject, projectId: secondId, projectName: "Proyecto Segundo", sgCode: null, clientName: null, city: null }, metrics: [{ key: "tasks.Pending", label: "Pendientes", value: 1 }], tasks: [] },
  ] },
};
const area = { area: "Presupuestos", pending: 4, inProgress: 2, completed: 1, overdue: 0, dueToday: 1, dueSoon: 2 };
const brief: IntelligenceResponse = { ...comparison, responseType: "management_brief", answer: "Presupuestos concentra seis tareas pendientes o en curso. Recomendaría revisar el vencimiento de hoy.", presentation: {
  kind: "management_brief", metrics: [{ key: "total_projects", label: "Proyectos", value: 7 }], items: [intelligenceTask], areas: [area],
  attentionCoverage: { total: 17, returned: 8, hasMore: true }, tasksCoverage: { total: 25, returned: 12, hasMore: true },
} };

describe("Management 4A contracts and accessible presentation", () => {
  it.each([comparison, brief])("accepts the extended $responseType wire contract", (value) => {
    expect(parseResponse(value)).toEqual(value);
  });
  it("renders ordered project articles with keyboard links, no table dependency or missing placeholders", async () => {
    const navigate = vi.fn();
    render(<IntelligenceResponseView response={comparison} onAsk={vi.fn()} onNavigate={navigate} />);
    const region = screen.getByRole("region", { name: "Comparación de proyectos" });
    const cards = within(region).getAllByRole("article");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual(["Casa Ximena", "Proyecto Segundo"]);
    expect(within(region).queryByRole("table")).not.toBeInTheDocument();
    const second = within(cards[1]);
    expect(second.getByRole("link", { name: "Proyecto Segundo" })).toHaveAttribute("href", `/projects/${secondId}`);
    expect(second.getByText("Pendientes")).toBeInTheDocument();
    expect(second.queryByText(/N\/A|No disponible|Sin SG|Sin vencimiento/)).not.toBeInTheDocument();
    const link = second.getByRole("link"); link.addEventListener("click", (event) => event.preventDefault()); link.focus(); await userEvent.keyboard("{Enter}");
    expect(navigate).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByText("Tareas actuales (1)"));
    expect(screen.getByText("Preparar cotización")).toBeVisible();
    expect(region).not.toHaveTextContent(/PrepareQuotation|NotStarted|LeadTimeStatus/);
  });
  it("presents brief metrics, areas, human statuses and honest partial coverage below the explanation", () => {
    render(<IntelligenceResponseView response={brief} onAsk={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText(brief.answer)).toBeInTheDocument();
    expect(screen.getByText("Proyectos").nextSibling).toHaveTextContent("7");
    const areaCard = screen.getByRole("article", { name: "Presupuestos" });
    expect(within(areaCard).getByText("Pendientes").nextSibling).toHaveTextContent("4");
    expect(screen.getByText(/Atención: datos recuperados de 8 de 17/)).toBeInTheDocument();
    expect(screen.getByText(/Tareas del resumen: datos recuperados de 12 de 25/)).toBeInTheDocument();
    expect(screen.getByText("Sin iniciar")).toBeInTheDocument();
  });
  it("handles empty brief without fabricated cards or unavailable placeholders", () => {
    const empty: IntelligenceResponse = { ...brief, presentation: { kind: "management_brief", metrics: [{ key: "total_projects", label: "Proyectos", value: 0 }], items: [], areas: [], attentionCoverage: { total: 0, returned: 0, hasMore: false } } };
    render(<IntelligenceResponseView response={empty} onAsk={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByText(/Hay más elementos/)).not.toBeInTheDocument();
    expect(screen.getByText("Proyectos").nextSibling).toHaveTextContent("0");
  });
  it.each([
    { ...comparison.presentation, projects: [comparison.presentation.projects![0]] },
    { ...comparison.presentation, projects: Array(5).fill(comparison.presentation.projects![0]) },
    { ...comparison.presentation, projects: Array(2).fill(comparison.presentation.projects![0]) },
    { ...comparison.presentation, areas: [area] },
    { ...comparison.presentation, projects: [{ ...comparison.presentation.projects![0], metrics: [{ key: "pending", label: "Pendientes", value: -1 }] }, comparison.presentation.projects![1]] },
    { ...comparison.presentation, projects: [{ ...comparison.presentation.projects![0], tasks: [{ ...intelligenceTask, projectId: secondId }] }, comparison.presentation.projects![1]] },
  ])("rejects malformed or mixed comparison %j", (presentation) => {
    expect(() => parseResponse({ ...comparison, presentation })).toThrow();
  });
  it.each([
    { total: 2, returned: 3, hasMore: false }, { total: 5, returned: 2, hasMore: false },
    { total: -1, returned: 0, hasMore: false }, { total: 5, returned: 2, hasMore: "true" },
  ])("rejects misleading coverage %j", (coverage) => {
    expect(() => parseResponse({ ...brief, presentation: { ...brief.presentation, attentionCoverage: coverage } })).toThrow();
  });
});

it("keeps comparison referents in the existing text/Live/text conversation without browser tool execution", async () => {
  mockLiveBrowser();
  const fetchMock = vi.fn(async (path: string, init: RequestInit) => {
    expect(init.method).toBeDefined();
    if (path.endsWith("/conversation")) return Response.json(conversationCreated, { status: 201 });
    if (path.endsWith("/close")) return Response.json({ closed: true });
    if (path.endsWith("/live/session")) return Response.json(liveCreated);
    if (path.endsWith("/session")) return Response.json({ authenticated: true, isManagement: true });
    return Response.json(comparison);
  });
  vi.stubGlobal("fetch", fetchMock);
  const state = { status: "authenticated" as const, ...roleContext("Management"), user: manager, error: null, signIn: vi.fn(), logout: vi.fn(), invalidateSession: vi.fn(), apiClient: createApiClient({ getSession: () => ({ token, generation: 1 , activeRole: "Management" as const}), invalidateSession: vi.fn() }) };
  render(<AuthContext.Provider value={state}><IntelligenceLauncher /></AuthContext.Provider>);
  await userEvent.click(screen.getByRole("button", { name: "Abrir SnG Intelligence" }));
  await waitFor(() => expect(screen.getByLabelText("Tu consulta")).toBeEnabled());
  await userEvent.type(screen.getByLabelText("Tu consulta"), "Compara los proyectos{Enter}");
  await screen.findByRole("region", { name: "Comparación de proyectos" });
  await userEvent.click(screen.getByRole("button", { name: "Iniciar conversación por voz" }));
  await waitFor(() => expect(LivePeer.instances[0]?.setRemoteDescription).toHaveBeenCalled());
  act(() => LivePeer.instances[0].started());
  expect(screen.getByLabelText("Tu consulta")).toBeDisabled();
  expect(LivePeer.instances[0].channel.send).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Finalizar conversación" }));
  await waitFor(() => expect(screen.getByLabelText("Tu consulta")).toBeEnabled());
  await userEvent.type(screen.getByLabelText("Tu consulta"), "Amplía el segundo{Enter}");
  await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/chat"))).toHaveLength(2));
  const bodies = fetchMock.mock.calls.filter(([path]) => path.endsWith("/chat") || path.endsWith("/live/session")).map(([, init]) => JSON.parse(init.body as string));
  expect(bodies.map((body) => body.conversationId)).toEqual(Array(3).fill(conversationCreated.conversationId));
  expect(bodies.every((body) => !('references' in body) && !('tools' in body))).toBe(true);
  expect(bodies[2].message).toBe("Amplía el segundo");
});
