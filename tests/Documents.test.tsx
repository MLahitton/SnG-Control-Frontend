import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectDetailPage } from "@/features/projects/ProjectDetailPage";
import { AuthContext } from "@/features/auth/context/AuthProvider";
import { createApiClient } from "@/lib/api/apiClient";
import type { ProjectDocuments } from "@/features/documents/types";
import type { ProjectTask } from "@/features/tasks/types";
import type { ProjectNotification } from "@/features/notifications/types";
import { client, project, task, inProgressTask, notification, deferred, mockBackend, renderOperational } from "./operationalFixtures";
import { handedOffDocuments, projectDocument, projectDocuments } from "./documentFixtures";
import { token, user } from "./fixtures";

function setup(documents: ProjectDocuments = projectDocuments, tasks: ProjectTask[] = []) {
  const state = { documents, tasks, notifications: [] as ProjectNotification[] };
  let mutate: (path: string, init: RequestInit) => unknown = () => Response.json({}, { status: 500 });
  const fetchMock = mockBackend((path, init) => {
    if (init.method !== "GET") return mutate(path, init);
    if (path === "projects/project-1/documents") return state.documents;
    if (path.endsWith("/file") || path.endsWith(".zip")) return new Response(new Uint8Array([80, 75]), { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="server-name.zip"' } });
    if (path === "projects/project-1") return project;
    if (path === "clients/client-1") return client;
    if (path.endsWith("/tasks")) return state.tasks;
    if (path.endsWith("/notifications")) return state.notifications;
    throw new Error("Unexpected test endpoint");
  });
  return { state, fetchMock, setMutation: (handler: typeof mutate) => { mutate = handler; } };
}
async function open() {
  renderOperational(<ProjectDetailPage id="project-1" />);
  await screen.findByRole("heading", { name: "Documentos vigentes" });
}
const documentPanel = () => screen.getByRole("region", { name: "Documentos del proyecto" });
const changes = (fetchMock: ReturnType<typeof mockBackend>) => fetchMock.mock.calls.filter(([, init]) => init.method !== "GET");
async function manifest(body: FormData) {
  const blob = body.get("manifest") as Blob;
  return new Promise<unknown>((resolve) => {
    const reader = new FileReader(); reader.onload = () => resolve(JSON.parse(reader.result as string)); reader.readAsText(blob);
  });
}

describe("document panel and capabilities", () => {
  it("loads documents independently while the rest of the project is already visible", async () => {
    const pending = deferred<unknown>();
    mockBackend((path) => path.endsWith("/documents") ? pending.promise : path === "projects/project-1" ? project : path === "clients/client-1" ? client : []);
    renderOperational(<ProjectDetailPage id="project-1" />);
    await screen.findByRole("heading", { name: project.name });
    expect(screen.getByText("Cargando documentos…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar a Presupuestos" })).not.toBeInTheDocument();
    await act(async () => pending.resolve(projectDocuments));
    await screen.findByText(projectDocument.originalFileName);
  });
  it("keeps project, tasks and SG readable after a documentary 403", async () => {
    mockBackend((path) => path.endsWith("/documents") ? Response.json({}, { status: 403 }) : path === "projects/project-1" ? { ...project, sgCode: "SG001" } : path === "clients/client-1" ? client : path.endsWith("/tasks") ? [inProgressTask] : []);
    renderOperational(<ProjectDetailPage id="project-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permiso");
    expect(screen.getByText("SG001")).toBeInTheDocument();
    expect(screen.getByText("En tiempo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar a Presupuestos" })).not.toBeInTheDocument();
  });
  it("requires documents before handoff and shows an empty state", async () => {
    setup({ ...projectDocuments, documents: [], canSendToBudgets: false }); await open();
    expect(screen.getByText("No hay documentos vigentes.")).toBeInTheDocument();
    expect(screen.getByText("Debes cargar al menos un documento del proyecto antes de enviarlo a Presupuestos.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar a Presupuestos" })).not.toBeInTheDocument();
  });
  it("shows duplicate names, metadata, current/history and initial handoff for a read-only user", async () => {
    setup({ ...handedOffDocuments, canModify: false, documents: [
      { ...projectDocument, inInitialHandoff: true },
      { ...projectDocument, id: "old", isCurrent: false, replacedAt: "2026-10-16T15:00:00Z", replacedByDocumentId: projectDocument.id, inInitialHandoff: true },
    ] }, [task]); await open();
    const panel = within(documentPanel());
    expect(panel.getAllByRole("heading", { name: "planos.pdf" })).toHaveLength(2);
    expect(panel.getAllByText(/1,5 KB/)).toHaveLength(2);
    expect(panel.getAllByText(/Subido por: Persona documental · documents@example.test/)).toHaveLength(2);
    expect(panel.getByText(/Reemplazado:.*16\/10\/2026/)).toBeInTheDocument();
    expect(panel.getByText("Reemplazado por: planos.pdf")).toBeInTheDocument();
    expect(panel.getByText("Por: Persona comercial · commercial@example.test")).toBeInTheDocument();
    expect(panel.getByText("1 documento(s) en el envío inicial.")).toBeInTheDocument();
    expect(panel.getAllByRole("button", { name: "Descargar" })).toHaveLength(2);
    for (const name of ["Seleccionar archivos", "Subir documentos", "Reemplazar", "Quitar"]) expect(panel.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(panel.queryByRole("group", { name: "Carga de documentos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar a Presupuestos" })).not.toBeInTheDocument();
  });
  it("treats a task without an initial snapshot as legacy", async () => {
    setup({ ...projectDocuments, canSendToBudgets: false }, [task]); await open();
    expect(screen.getByText("Este proyecto fue enviado antes de habilitar el historial documental inicial.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descargar documentos del envío inicial" })).not.toBeInTheDocument();
  });
  it("uses each backend capability independently of the creator identity", async () => {
    setup({ ...projectDocuments, canModify: false, canRemove: true, canSendToBudgets: false }); await open();
    expect(screen.getByRole("button", { name: "Quitar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Seleccionar archivos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar a Presupuestos" })).not.toBeInTheDocument();
  });
  it("never offers removal or replacement for a historical document even with capabilities", async () => {
    setup({ ...projectDocuments, documents: [projectDocument, { ...projectDocument, id: "old", isCurrent: false, replacedAt: "2026-10-16T15:00:00Z", replacedByDocumentId: projectDocument.id }] });
    await open();
    expect(screen.getAllByRole("button", { name: "Quitar" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Reemplazar" })).toHaveLength(1);
    expect(within(documentPanel()).getAllByRole("button", { name: "Descargar" })).toHaveLength(2);
  });
});

describe("document upload and replacement", () => {
  it("selects multiple original files, waits for submit, blocks double submit and refreshes", async () => {
    const { state, fetchMock, setMutation } = setup();
    const pending = deferred<unknown>(); setMutation(() => pending.promise);
    await open();
    const first = new File(["first"], "duplicate.unknown", { type: "text/html" });
    const second = new File(["second"], "duplicate.unknown");
    const input = screen.getByLabelText("Archivos del proyecto");
    const click = vi.spyOn(input, "click");
    await userEvent.click(screen.getByRole("button", { name: "Seleccionar archivos" }));
    expect(click).toHaveBeenCalledOnce();
    await userEvent.upload(input, [first, second]);
    expect(screen.getByText("2 archivo(s) seleccionado(s) · Total: 11 B")).toBeInTheDocument();
    expect(changes(fetchMock)).toHaveLength(0);
    const form = screen.getByRole("button", { name: "Subir documentos" }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(screen.getByText("Subiendo...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir documentos" })).toBeDisabled();
    expect(changes(fetchMock)).toHaveLength(1);
    const [url, init] = changes(fetchMock)[0]; expect(url).toBe("/api/backend/projects/project-1/documents/batch");
    const body = init.body as FormData;
    expect([...body.keys()]).toEqual(["manifest", "file-0", "file-1"]);
    expect(body.get("file-0")).toBe(first); expect(body.get("file-1")).toBe(second);
    expect(await manifest(body)).toEqual({ files: [{ partName: "file-0", replacesDocumentId: null }, { partName: "file-1", replacesDocumentId: null }] });
    state.documents = { ...projectDocuments, documents: [...projectDocuments.documents, { ...projectDocument, id: "new", originalFileName: "new-result.pdf" }] };
    await act(async () => pending.resolve({}));
    expect(await screen.findByText("new-result.pdf")).toBeInTheDocument();
    expect(screen.queryByText(/archivo\(s\) seleccionado/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/documents"))).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/tasks"))).toHaveLength(1);
  });
  it("supports drag/drop without auto-upload or extension filtering", async () => {
    const { fetchMock } = setup(); await open();
    fireEvent.drop(screen.getByRole("group", { name: "Carga de documentos" }), { dataTransfer: { files: [new File(["svg"], "source.svg"), new File(["html"], "page.html")] } });
    expect(screen.getByText("2 archivo(s) seleccionado(s) · Total: 7 B")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir documentos" })).toBeEnabled();
    expect(changes(fetchMock)).toHaveLength(0);
  });
  it.each([
    [[0], 1, "vacíos"], [[100_000_001], 1, "100 MB"], [[100_000_000, 100_000_000, 100_000_000, 1], 1, "300 MB"], [[1], 15, "15 documentos"],
  ] as const)("blocks invalid bytes/count locally: %j", async (sizes, count, message) => {
    const { fetchMock } = setup({ ...projectDocuments, documents: Array.from({ length: count }, (_, i) => ({ ...projectDocument, id: `doc-${i}` })) });
    await open();
    const files = sizes.map((size) => Object.defineProperty(new File(["x"], "same.any"), "size", { value: size }));
    fireEvent.change(screen.getByLabelText("Archivos del proyecto"), { target: { files } });
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Subir documentos" })).toBeDisabled();
    expect(changes(fetchMock)).toHaveLength(0);
  });
  it("confirms an explicit replacement, preserving history and refreshing notifications without tasks", async () => {
    const { state, fetchMock, setMutation } = setup(handedOffDocuments, [inProgressTask]);
    setMutation(() => {
      state.documents = { ...handedOffDocuments, documents: [
        { ...projectDocument, isCurrent: false, replacedAt: "2026-10-16T16:00:00Z", replacedByDocumentId: "new", inInitialHandoff: true },
        { ...projectDocument, id: "new", originalFileName: "revision.pdf" },
      ] };
      state.notifications = [{ ...notification, kind: "ProjectDocumentsUpdated", title: "Documentación actualizada" }];
      return {};
    });
    await open(); const timing = screen.getByRole("region", { name: "Tareas del proyecto" }).textContent;
    await userEvent.click(screen.getByRole("button", { name: "Reemplazar" }));
    await userEvent.upload(screen.getByLabelText("Archivo de reemplazo"), new File(["revision"], "revision.pdf"));
    expect(screen.getByText(/El documento anterior se conservará en el historial/)).toBeInTheDocument();
    expect(changes(fetchMock)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar reemplazo" }));
    expect(await screen.findByText("Documentación actualizada")).toBeInTheDocument();
    expect(await manifest(changes(fetchMock)[0][1].body as FormData)).toEqual({ files: [{ partName: "file-0", replacesDocumentId: projectDocument.id }] });
    expect(screen.getByText("Reemplazado por: revision.pdf")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tareas del proyecto" }).textContent).toBe(timing);
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/tasks"))).toHaveLength(1);
    expect(screen.queryByText("Alerta de atraso activa")).not.toBeInTheDocument();
  });
  it.each([
    [413, "FileTooLarge", "100 MB"], [413, "BatchTooLarge", "300 MB"], [409, "DocumentLimitExceeded", "15 documentos"],
    [400, "InvalidDocumentBatch", "La carga de documentos no es válida"], [409, "InvalidReplacement", "ya no puede ser reemplazado"],
  ] as const)("preserves selection and shows safe %s %s", async (status, code, message) => {
    const { setMutation } = setup(); setMutation(() => Response.json({ code, detail: "private diagnostic" }, { status })); await open();
    await userEvent.upload(screen.getByLabelText("Archivos del proyecto"), new File(["x"], "retry.bin"));
    await userEvent.click(screen.getByRole("button", { name: "Subir documentos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    await waitFor(() => expect(screen.getByRole("button", { name: "Subir documentos" })).toBeEnabled());
    expect(screen.getByText("retry.bin — 1 B")).toBeInTheDocument();
    expect(screen.queryByText(/private diagnostic/)).not.toBeInTheDocument();
  });
});

describe("document removal and handoff", () => {
  it("confirms removal before bodyless DELETE and refreshes after 204", async () => {
    const { state, fetchMock, setMutation } = setup();
    setMutation(() => { state.documents = { ...projectDocuments, documents: [], canSendToBudgets: false }; return new Response(null, { status: 204 }); });
    await open(); await userEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(screen.getByText(/¿Quitar del proyecto/)).toBeInTheDocument(); expect(changes(fetchMock)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar quitar" }));
    expect(await screen.findByText("No hay documentos vigentes.")).toBeInTheDocument();
    const [path, init] = changes(fetchMock)[0];
    expect(path).toBe("/api/backend/projects/project-1/documents/document-1"); expect(init.method).toBe("DELETE"); expect(init.body).toBeUndefined();
  });
  it("handles removal locked by a concurrent handoff and hides removal after refresh", async () => {
    const { state, setMutation } = setup(); setMutation(() => { state.documents = handedOffDocuments; return Response.json({ code: "DocumentRemovalLocked" }, { status: 409 }); });
    await open(); await userEvent.click(screen.getByRole("button", { name: "Quitar" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar quitar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Los documentos ya enviados a Presupuestos no pueden quitarse.");
    await screen.findByRole("heading", { name: "Envío inicial a Presupuestos" });
    expect(screen.queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
  });
  it("uses canSendToBudgets, confirms handoff and refreshes documents/tasks/notifications", async () => {
    const { state, fetchMock, setMutation } = setup();
    setMutation(() => { state.documents = handedOffDocuments; state.tasks = [task]; state.notifications = [notification]; return task; });
    await open(); await userEvent.click(screen.getByRole("button", { name: "Enviar a Presupuestos" }));
    expect(changes(fetchMock)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar envío" }));
    await screen.findByRole("heading", { name: "Envío inicial a Presupuestos" });
    expect(await screen.findByText(notification.title)).toBeInTheDocument(); expect(screen.getByText("Sin iniciar")).toBeInTheDocument();
    for (const suffix of ["/documents", "/tasks", "/notifications"]) expect(fetchMock.mock.calls.filter(([path]) => path.endsWith(suffix))).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar a Presupuestos" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seleccionar archivos" })).toBeInTheDocument();
  });
  it("handles concurrent DocumentsRequired specifically and refreshes documents and tasks", async () => {
    const { state, fetchMock, setMutation } = setup();
    setMutation(() => { state.documents = { ...projectDocuments, documents: [], canSendToBudgets: false }; return Response.json({ code: "DocumentsRequired" }, { status: 409 }); });
    await open(); await userEvent.click(screen.getByRole("button", { name: "Enviar a Presupuestos" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar envío" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Debes cargar al menos un documento");
    await screen.findByText("No hay documentos vigentes.");
    expect(screen.queryByText("Proyecto enviado a Presupuestos.")).not.toBeInTheDocument();
    for (const suffix of ["/documents", "/tasks"]) expect(fetchMock.mock.calls.filter(([path]) => path.endsWith(suffix))).toHaveLength(2);
  });
});

describe("document downloads and identity changes", () => {
  it("replaces already loaded read-only capabilities when signing in with another Subject", async () => {
    const { state, fetchMock } = setup({ ...handedOffDocuments, canModify: false }, [task]);
    const apiClient = createApiClient({ getSession: () => ({ token, generation: 1 }), invalidateSession: vi.fn() });
    const context = { status: "authenticated" as const, user: { ...user, subject: "test-budgets-subject" }, error: null, signIn: vi.fn(), logout: vi.fn(), invalidateSession: vi.fn(), apiClient };
    const view = render(<AuthContext.Provider value={context}><ProjectDetailPage id="project-1" /></AuthContext.Provider>);
    await screen.findByRole("heading", { name: "Envío inicial a Presupuestos" });
    expect(screen.queryByRole("button", { name: "Subir documentos" })).not.toBeInTheDocument();
    state.documents = handedOffDocuments;
    view.rerender(<AuthContext.Provider value={{ ...context, user: { ...user, subject: "test-commercial-subject" } }}><ProjectDetailPage id="project-1" /></AuthContext.Provider>);
    expect(await screen.findByRole("button", { name: "Subir documentos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reemplazar" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/documents"))).toHaveLength(2);
  });
  it("downloads individual, current ZIP and snapshot with no inline rendering", async () => {
    const { fetchMock } = setup({ ...handedOffDocuments, canModify: false, documents: [...handedOffDocuments.documents,
      { ...projectDocument, id: "old", originalFileName: "old.pdf", isCurrent: false, replacedAt: "2026-10-16T15:00:00Z", replacedByDocumentId: projectDocument.id },
    ] }, [task]);
    vi.stubGlobal("showSaveFilePicker", undefined);
    const revoke = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:document"); static revokeObjectURL = revoke; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("server-name.zip"); });
    await open();
    for (const button of [...screen.getAllByRole("button", { name: "Descargar" }), screen.getByRole("button", { name: "Descargar documentos actuales" }), screen.getByRole("button", { name: "Descargar documentos del envío inicial" })]) {
      await userEvent.click(button);
      await waitFor(() => expect(button).toBeEnabled());
    }
    expect(click).toHaveBeenCalledTimes(4); expect(revoke).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(expect.arrayContaining([
      "/api/backend/projects/project-1/documents/document-1/file", "/api/backend/projects/project-1/documents/current.zip", "/api/backend/projects/project-1/documents/initial-handoff.zip",
      "/api/backend/projects/project-1/documents/old/file",
    ]));
    expect(document.querySelector("iframe,object,embed,svg")).toBeNull();
  });
  it("reloads all project resources for a new Subject even with the same API client and URL", async () => {
    let currentSubject = "test-budgets-subject";
    const delayed = deferred<unknown>();
    const fetchMock = mockBackend((path) => {
      if (path.endsWith("/documents")) return currentSubject === "test-budgets-subject" ? delayed.promise : projectDocuments;
      if (path === "projects/project-1") return { ...project, name: currentSubject === "test-budgets-subject" ? "Vista anterior" : "Vista actual" };
      if (path === "clients/client-1") return client;
      return [];
    });
    const apiClient = createApiClient({ getSession: () => ({ token, generation: 1 }), invalidateSession: vi.fn() });
    const context = { status: "authenticated" as const, user: { ...user, subject: currentSubject }, error: null, signIn: vi.fn(), logout: vi.fn(), invalidateSession: vi.fn(), apiClient };
    const view = render(<AuthContext.Provider value={context}><ProjectDetailPage id="project-1" /></AuthContext.Provider>);
    await screen.findByRole("heading", { name: "Vista anterior" });
    currentSubject = "test-commercial-subject";
    view.rerender(<AuthContext.Provider value={{ ...context, user: { ...user, subject: currentSubject } }}><ProjectDetailPage id="project-1" /></AuthContext.Provider>);
    expect(screen.queryByText("Vista anterior")).not.toBeInTheDocument();
    await screen.findByRole("heading", { name: "Vista actual" });
    expect(await screen.findByRole("button", { name: "Subir documentos" })).toBeInTheDocument();
    await act(async () => delayed.resolve({ ...handedOffDocuments, canModify: false }));
    expect(screen.getByRole("button", { name: "Subir documentos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar a Presupuestos" })).toBeInTheDocument();
    for (const path of ["/api/backend/projects/project-1", "/api/backend/projects/project-1/documents", "/api/backend/projects/project-1/tasks", "/api/backend/projects/project-1/notifications"]) {
      expect(fetchMock.mock.calls.filter(([url]) => url === path)).toHaveLength(2);
    }
  });
});
