import { roleContext } from "./roleFixtures";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IntelligenceResponseView } from "@/features/intelligence/components/IntelligenceResponseView";
import { IntelligenceLauncher } from "@/features/intelligence/components/IntelligenceLauncher";
import { AuthContext } from "@/features/auth/context/AuthProvider";
import { createApiClient } from "@/lib/api/apiClient";
import { parseResponse, parseVoice } from "@/features/intelligence/parser";
import type { DocumentSource, IntelligenceResponse } from "@/features/intelligence/types";
import { intelligenceProject, projectId, conversationCreated } from "./intelligenceFixtures";
import { token } from "./fixtures";
import { manager } from "./managementFixtures";
import { liveCreated } from "./liveFixtures";
import { LivePeer, mockLiveBrowser } from "./liveBrowser";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const documentId = "55555555-5555-4555-8555-555555555555";
const source: DocumentSource = { kind: "document", documentId, projectId, filename: "especificaciones.pdf", sizeBytes: 2000, uploadedAt: "2026-10-22T02:00:00Z", isCurrent: true, inInitialHandoff: false, replacedByDocumentId: null };
const response: IntelligenceResponse = {
  responseType: "document_analysis", answer: "El documento especifica vidrio templado.", spokenAnswer: "El documento especifica vidrio templado.",
  references: [{ type: "document", projectId, documentId, label: source.filename }],
  presentation: { kind: "document_analysis", project: intelligenceProject, sources: [source] },
};

describe("Project Document Intelligence 4B", () => {
  it("parses the same contract for text and basic voice, keeping only public metadata", () => {
    expect(parseResponse(response)).toEqual(response);
    expect(parseVoice({ ...response, transcript: "Resume el archivo" })).toEqual({ ...response, transcript: "Resume el archivo" });
    const parsed = parseResponse({ ...response, file_data: "private bytes", presentation: { ...response.presentation, sources: [{ ...source, file_data: "private bytes", providerUrl: "https://api.openai.com/private" }] } });
    expect(JSON.stringify(parsed)).not.toMatch(/private bytes|providerUrl|file_data|api.openai/);
  });
  it.each([
    [], Array(5).fill(source), [source, source], [{ ...source, documentId: "https://evil.test" }],
    [{ ...source, projectId: "99999999-9999-4999-8999-999999999999" }],
    [{ ...source, sizeBytes: -1 }], [{ ...source, isCurrent: "true" }],
    [{ ...source, inInitialHandoff: null }], [{ ...source, uploadedAt: "not a date" }],
    [{ ...source, uploadedAt: "2026-10-22T02:00:00" }], [{ ...source, replacedByDocumentId: "bad" }],
  ].map((sources) => [sources]))("rejects malformed or mismatched document sources %j", (sources) => {
    expect(() => parseResponse({ ...response, presentation: { ...response.presentation, sources } })).toThrow();
  });
  it.each([false, true])("renders accessible source lists and project navigation (mobile=%s)", async (mobile) => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: mobile })));
    const navigate = vi.fn();
    render(<IntelligenceResponseView response={response} onAsk={vi.fn()} onNavigate={navigate} />);
    const region = screen.getByRole("region", { name: "Fuentes" });
    expect(within(region).getByRole("list")).toBeInTheDocument();
    expect(within(region).getByText(source.filename)).toBeInTheDocument();
    expect(region).toHaveTextContent(/Actual/);
    expect(region).toHaveTextContent(/21.*(?:oct|10).*2026/); // Colombia, previous calendar day.
    expect(region).toHaveTextContent("2 kB");
    const link = within(region).getByRole("link", { name: "Abrir proyecto" });
    expect(link).toHaveAttribute("href", `/projects/${projectId}`);
    link.addEventListener("click", (event) => event.preventDefault());
    link.focus(); await userEvent.keyboard("{Enter}");
    expect(navigate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(document.querySelector("iframe,embed,object,a[download]")).toBeNull();
    expect(screen.getAllByRole("link").every((item) => item.getAttribute("href") === `/projects/${projectId}`)).toBe(true);
  });
  it("handles optional size, historical sources and initial handoff without inventing missing values", () => {
    const minimal = { ...source }; delete minimal.sizeBytes; delete minimal.replacedByDocumentId;
    const value = parseResponse({ ...response, presentation: { ...response.presentation, sources: [{ ...minimal, isCurrent: false, inInitialHandoff: true }] } });
    render(<IntelligenceResponseView response={value} onAsk={vi.fn()} onNavigate={vi.fn()} />);
    const region = screen.getByRole("region", { name: "Fuentes" });
    expect(region).toHaveTextContent("Histórico"); expect(region).toHaveTextContent("Envío inicial");
    expect(region).not.toHaveTextContent(/kB|undefined|Sin tamaño/);
  });
  it("renders document metadata lists and all ambiguity options without arbitrary selection", () => {
    const documents = Array.from({ length: 7 }, (_, i) => ({ ...source, documentId: `55555555-5555-4555-8555-${String(i).padStart(12, "0")}` }));
    const value = parseResponse({ ...response, responseType: "clarification", presentation: { kind: "clarification", candidates: [], documents } });
    const ask = vi.fn();
    const view = render(<IntelligenceResponseView response={value} onAsk={ask} onNavigate={vi.fn()} />);
    expect(within(screen.getByRole("region", { name: "Fuentes" })).getAllByRole("listitem")).toHaveLength(7);
    expect(ask).not.toHaveBeenCalled();
    view.rerender(<IntelligenceResponseView response={parseResponse({ ...response, responseType: "list", presentation: { kind: "list", items: [source] } })} onAsk={ask} onNavigate={vi.fn()} />);
    expect(screen.getAllByText(source.filename)).toHaveLength(2);
  });
  it("renders untrusted filenames as text, without executing markup", () => {
    const filename = "<img src=x onerror=alert(1)>.pdf";
    render(<IntelligenceResponseView response={parseResponse({ ...response, presentation: { ...response.presentation, sources: [{ ...source, filename }] } })} onAsk={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText(filename)).toBeInTheDocument(); expect(document.querySelector("img")).toBeNull();
  });
});

it("continues document follow-ups across text/Live/text with the existing conversation and no browser file tools", async () => {
  mockLiveBrowser();
  const fetchMock = vi.fn(async (path: string, init: RequestInit) => {
    expect(init.method).toBeDefined();
    if (path.endsWith("/conversation/resume")) return Response.json(conversationCreated, { status: 201 });
    if (path.endsWith("/close")) return Response.json({ closed: true });
    if (path.endsWith("/live/session")) return Response.json(liveCreated);
    if (path.endsWith("/session")) return Response.json({ authenticated: true, isManagement: true });
    return Response.json(response);
  });
  vi.stubGlobal("fetch", fetchMock);
  const state = { status: "authenticated" as const, ...roleContext("Management"), user: manager, error: null, signIn: vi.fn(), logout: vi.fn(), invalidateSession: vi.fn(), apiClient: createApiClient({ getSession: () => ({ token, generation: 1 , activeRole: "Management" as const}), invalidateSession: vi.fn() }) };
  render(<AuthContext.Provider value={state}><IntelligenceLauncher /></AuthContext.Provider>);
  await userEvent.click(screen.getByRole("button", { name: "Abrir SnG Intelligence" }));
  await waitFor(() => expect(screen.getByLabelText("Tu consulta")).toBeEnabled());
  await userEvent.type(screen.getByLabelText("Tu consulta"), "Resume el documento{Enter}");
  await screen.findByRole("region", { name: "Fuentes" });
  await userEvent.click(screen.getByRole("button", { name: "Iniciar conversación por voz" }));
  await waitFor(() => expect(LivePeer.instances[0]?.setRemoteDescription).toHaveBeenCalled());
  act(() => LivePeer.instances[0].started());
  expect(LivePeer.instances[0].channel.send).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Finalizar conversación" }));
  await waitFor(() => expect(screen.getByLabelText("Tu consulta")).toBeEnabled());
  await userEvent.type(screen.getByLabelText("Tu consulta"), "¿Y menciona protección UV?{Enter}");
  await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/chat"))).toHaveLength(2));
  const bodies = fetchMock.mock.calls.filter(([path]) => path.endsWith("/chat") || path.endsWith("/live/session")).map(([, init]) => JSON.parse(init.body as string));
  expect(bodies.map((body) => body.conversationId)).toEqual(Array(3).fill(conversationCreated.conversationId));
  expect(bodies.every((body) => !("references" in body) && !("tools" in body) && !("file_data" in body) && !("documentId" in body))).toBe(true);
  expect(fetchMock.mock.calls.every(([path]) => !/openai|documents.*file|files/.test(path))).toBe(true);
});
