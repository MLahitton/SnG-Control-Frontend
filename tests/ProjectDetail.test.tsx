import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProjectDetailPage } from "@/features/projects/ProjectDetailPage";
import type { Project } from "@/features/projects/types";
import type { ProjectTask } from "@/features/tasks/types";
import { client, project, task, inProgressTask, notification, deferred, mockBackend, renderOperational } from "./operationalFixtures";

function backend(initialTasks: ProjectTask[] = [], initialProject: Project = project) {
  const state = { project: initialProject, tasks: initialTasks, notifications: [notification] };
  let mutation: (path: string, init: RequestInit) => unknown = () => Response.json({}, { status: 500 });
  const fetchMock = mockBackend((path, init) => {
    if (init.method !== "GET") return mutation(path, init);
    if (path === "projects/project-1") return state.project;
    if (path === "clients/client-1") return client;
    if (path === "projects/project-1/tasks") return state.tasks;
    if (path === "projects/project-1/notifications") return state.notifications;
    throw new Error("Unexpected test endpoint");
  });
  return { state, fetchMock, setMutation: (handler: typeof mutation) => { mutation = handler; } };
}
async function openDetail() {
  renderOperational(<ProjectDetailPage id="project-1" />);
  await screen.findByRole("heading", { name: project.name });
}
const mutationCalls = (fetchMock: ReturnType<typeof mockBackend>) => fetchMock.mock.calls.filter(([, init]) => init.method !== "GET");

describe("Project detail and send to Budgets", () => {
  it("loads project, client, tasks and notification history without operational subjects", async () => {
    const { fetchMock } = backend([task]); await openDetail();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      "/api/backend/projects/project-1", "/api/backend/clients/client-1", "/api/backend/projects/project-1/tasks", "/api/backend/projects/project-1/notifications",
    ]));
    for (const text of [client.name, notification.title, "Sin iniciar"]) expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Preparar cotización" })).toBeInTheDocument();
    expect(screen.getByText(/Persona de prueba · persona@example.test/)).toBeInTheDocument();
    expect(screen.queryByText(/private-|test-subject/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar a Presupuestos" })).not.toBeInTheDocument();
    expect(screen.getByText("El plazo comienza al asignar el SG.")).toBeInTheDocument();
  });
  it("shows a safe 404 without mutation actions", async () => {
    mockBackend(() => Response.json({ detail: "internal storage" }, { status: 404 }));
    renderOperational(<ProjectDetailPage id="missing" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se encontró el proyecto");
    expect(screen.queryByRole("button", { name: "Enviar a Presupuestos" })).not.toBeInTheDocument();
    expect(screen.queryByText(/internal storage/)).not.toBeInTheDocument();
  });
  it("requires explicit confirmation, blocks double send, then refreshes tasks and notifications", async () => {
    const { state, fetchMock, setMutation } = backend();
    const pending = deferred<unknown>();
    setMutation((path, init) => { expect(path).toBe("projects/project-1/send-to-budgets"); expect(init.body).toBeUndefined(); return pending.promise; });
    await openDetail();
    await userEvent.click(screen.getByRole("button", { name: "Enviar a Presupuestos" }));
    expect(mutationCalls(fetchMock)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mutationCalls(fetchMock)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Enviar a Presupuestos" }));
    const confirm = screen.getByRole("button", { name: "Confirmar envío" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(screen.getByRole("button", { name: "Enviando…" })).toBeDisabled();
    expect(mutationCalls(fetchMock)).toHaveLength(1);
    state.tasks = [task]; state.notifications = [{ ...notification, title: "Nueva asignación" }];
    await act(async () => pending.resolve(task));
    await screen.findByText("Nueva asignación");
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText("Sin iniciar")).toBeInTheDocument();
    expect(screen.getByText("Vence: Sin fecha asignada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar a Presupuestos" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/tasks"))).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/notifications"))).toHaveLength(2);
  });
  it("refreshes after a safe send conflict and preserves the backend code", async () => {
    const { state, fetchMock, setMutation } = backend();
    setMutation(() => { state.tasks = [task]; return Response.json({ code: "AlreadySent", detail: "secret-token" }, { status: 409 }); });
    await openDetail();
    await userEvent.click(screen.getByRole("button", { name: "Enviar a Presupuestos" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar envío" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AlreadySent");
    await screen.findByRole("heading", { name: "Preparar cotización" });
    expect(screen.queryByRole("button", { name: "Enviar a Presupuestos" })).not.toBeInTheDocument();
    expect(screen.queryByText(/secret-token/)).not.toBeInTheDocument();
    expect(mutationCalls(fetchMock)).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/backend/projects/project-1")).toHaveLength(2);
  });
  it("retains the successful transition if its related refresh fails, with GET-only retry", async () => {
    let sent = false; let refreshFails = true;
    const fetchMock = mockBackend((path, init) => {
      if (init.method === "POST") { sent = true; return task; }
      if (path.endsWith("/notifications")) return sent && refreshFails ? Response.json({}, { status: 503 }) : [notification];
      if (path.endsWith("/tasks")) return sent ? [task] : [];
      if (path.startsWith("clients/")) return client;
      return project;
    });
    await openDetail();
    await userEvent.click(screen.getByRole("button", { name: "Enviar a Presupuestos" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar envío" }));
    await screen.findByText(/La operación se guardó/);
    expect(screen.getByRole("heading", { name: "Preparar cotización" })).toBeInTheDocument();
    refreshFails = false;
    await userEvent.click(screen.getByRole("button", { name: "Volver a cargar" }));
    await screen.findByRole("heading", { name: project.name });
    expect(mutationCalls(fetchMock)).toHaveLength(1);
  });
});

describe("SG assignment and correction", () => {
  it("assigns normalized SG001 once and renders the backend project/task response and notifications", async () => {
    const { state, fetchMock, setMutation } = backend([task]);
    const pending = deferred<unknown>();
    setMutation((path, init) => { expect(path).toBe("projects/project-1/sg-code"); expect(init.method).toBe("PUT"); expect(JSON.parse(init.body as string)).toEqual({ sgCode: "SG001" }); return pending.promise; });
    await openDetail();
    await userEvent.type(screen.getByLabelText("Código SG"), " sg001 ");
    const form = screen.getByRole("button", { name: "Asignar SG" }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(mutationCalls(fetchMock)).toHaveLength(1);
    state.notifications = [{ ...notification, title: "Plazo iniciado" }];
    await act(async () => pending.resolve({ project: { ...project, sgCode: "SG001" }, prepareQuotationTask: inProgressTask }));
    expect(await screen.findByText("SG001")).toBeInTheDocument();
    expect(screen.getByText("En curso")).toBeInTheDocument();
    expect(screen.getByText("En tiempo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Corregir SG" })).toBeInTheDocument();
    expect(await screen.findByText("Plazo iniciado")).toBeInTheDocument();
    expect(screen.getByText(/Vence:.*22\/10\/2026.*5:00/)).toBeInTheDocument();
    expect(screen.queryByText("El plazo comienza al asignar el SG.")).not.toBeInTheDocument();
  });
  it.each(["SG", "SG-12", "ABC12", "SG１２", "SG1 2"])("does not submit invalid SG %s", async (value) => {
    const { fetchMock } = backend([task]); await openDetail();
    await userEvent.type(screen.getByLabelText("Código SG"), value);
    await userEvent.click(screen.getByRole("button", { name: "Asignar SG" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("dígitos del 0 al 9");
    expect(mutationCalls(fetchMock)).toHaveLength(0);
  });
  it("corrects SG with the exact same dates returned by backend, even when dates are in the past", async () => {
    const oldTask: ProjectTask = { ...inProgressTask, startedAt: "2020-01-01T15:00:00Z", deadlineAt: "2020-01-08T22:00:00Z" };
    const { setMutation, fetchMock } = backend([oldTask], { ...project, sgCode: "SG001" });
    setMutation(() => ({ project: { ...project, sgCode: "SG780" }, prepareQuotationTask: oldTask }));
    await openDetail();
    const tasksRegion = screen.getByRole("region", { name: "Tareas del proyecto" });
    const before = tasksRegion.textContent;
    await userEvent.type(screen.getByLabelText("Código SG"), "SG780");
    await userEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    await screen.findByText("SG corregido.");
    expect(screen.getByText("SG780")).toBeInTheDocument();
    expect(tasksRegion.textContent).toBe(before);
    expect(within(tasksRegion).getByText("En tiempo")).toBeInTheDocument();
    expect(within(tasksRegion).getAllByRole("listitem")).toHaveLength(1);
    expect(mutationCalls(fetchMock)).toHaveLength(1);
  });
  it.each([
    { tasks: [], sgCode: null },
    { tasks: [{ ...task, status: "Completed" as const }], sgCode: "SG1" },
    { tasks: [task], sgCode: "SG1" },
    { tasks: [inProgressTask], sgCode: null },
  ])("does not offer SG changes outside the supported state: $sgCode / $tasks.0.status", async ({ tasks, sgCode }) => {
    backend(tasks, { ...project, sgCode }); await openDetail();
    expect(screen.queryByLabelText("Código SG")).not.toBeInTheDocument();
  });
  it("does not guess a 409 cause and refreshes project/tasks after a concurrent change", async () => {
    const { state, setMutation, fetchMock } = backend([task]);
    setMutation(() => {
      state.project = { ...project, sgCode: "SG55" }; state.tasks = [inProgressTask];
      return Response.json({ detail: "duplicate secret" }, { status: 409 });
    });
    await openDetail();
    await userEvent.type(screen.getByLabelText("Código SG"), "SG1");
    await userEvent.click(screen.getByRole("button", { name: "Asignar SG" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El código puede estar en uso o el proyecto ya no permite esta operación");
    await screen.findByText("SG55");
    expect(screen.getByText("En curso")).toBeInTheDocument();
    expect(screen.queryByText(/duplicate secret/)).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/tasks"))).toHaveLength(2));
  });
});
