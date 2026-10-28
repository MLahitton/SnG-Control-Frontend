import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import OverviewPage from "@/app/(app)/management/page";
import { TaskTimingBadge } from "@/features/tasks/TaskList";
import { parseManagementOverview, parseManagementTasks } from "@/features/management/parser";
import { mockBackend, renderOperational } from "./operationalFixtures";
import { manager } from "./managementFixtures";

// Wire literals deliberately independent from the shared typed fixtures.
const backendOverview = {
  totalProjects: 1,
  tasks: { pending: 0, inProgress: 7, completed: 2 },
  leadTime: { notStarted: 0, onTrack: 1, dueSoon: 1, dueToday: 2, overdue: 3,
    completedOnTime: 2, completedLate: 0, untrackedLegacy: 0 },
  areas: [], attention: { total: 0, items: [] },
};
const backendTask = { quotationRound: 1,
  taskId: "20000000-0000-4000-8000-000000000002", projectId: "10000000-0000-4000-8000-000000000001",
  projectName: "Proyecto", clientId: "30000000-0000-4000-8000-000000000003", clientName: "Cliente",
  sgCode: null, city: "Bogotá", productLine: "Classic", area: "Budgets", type: "PrepareQuotation",
  status: "InProgress", assignedAt: "2026-10-14T15:00:00Z", startedAt: "2026-10-14T15:00:00Z",
  completedAt: null, deadlineAt: "2026-10-20T22:00:00Z", wasOverdue: false, leadTimeStatus: "OnTrack",
};

describe("official Lead Time wire contract", () => {
  it("renders /management with backend camelCase counts without crashing", async () => {
    mockBackend(() => backendOverview);
    renderOperational(<OverviewPage />, manager);
    await screen.findByText("Tareas atrasadas");
    expect(screen.getByText("Tareas atrasadas").parentElement).toHaveTextContent("3");
    expect(screen.getByText("Vencen hoy").parentElement).toHaveTextContent("2");
    expect(screen.getByText("Vencen pronto").parentElement).toHaveTextContent("1");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("renders an OnTrack task from the actual wire property", () => {
    const [task] = parseManagementTasks([backendTask]);
    render(<TaskTimingBadge task={task} />);
    expect(screen.getByText("En tiempo")).toBeInTheDocument();
    expect(task.leadTimeStatus).toBe("OnTrack");
  });
  // Obsolete names appear only as rejected input, never as compatibility aliases.
  it.each(["LeadTime", "leakTime"])("rejects overview property %s and shows a safe error", async (name) => {
    const { leadTime, ...rest } = backendOverview;
    const wrong = { ...rest, [name]: leadTime };
    expect(() => parseManagementOverview(wrong)).toThrow();
    expect(() => parseManagementOverview({ ...backendOverview, [name]: leadTime })).toThrow();
    mockBackend(() => wrong);
    renderOperational(<OverviewPage />, manager);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Tareas atrasadas")).not.toBeInTheDocument();
  });
  it.each(["LeadTimeStatus", "LeakTimeStatus", "leakTimeStatus"])("rejects task and attention property %s", (name) => {
    const { leadTimeStatus, ...rest } = backendTask;
    expect(() => parseManagementTasks([{ ...rest, [name]: leadTimeStatus }])).toThrow();
    expect(() => parseManagementTasks([{ ...backendTask, [name]: leadTimeStatus }])).toThrow();
    const attention = { taskId: backendTask.taskId, projectId: backendTask.projectId, projectName: "Proyecto",
      clientName: "Cliente", sgCode: null, area: "Budgets", taskType: "PrepareQuotation", taskStatus: "InProgress",
      deadlineAt: backendTask.deadlineAt, startedAt: backendTask.startedAt };
    expect(() => parseManagementOverview({ ...backendOverview, attention: { total: 1,
      items: [{ ...attention, [name]: "Overdue" }] } })).toThrow();
  });
  it.each([null, {}, { ...backendOverview, leadTime: null },
    { ...backendOverview, leadTime: { ...backendOverview.leadTime, overdue: "3" } },
    { ...backendOverview, tasks: { pending: -1, inProgress: 0, completed: 0 } },
    { ...backendOverview, areas: null }])("rejects malformed overview instead of inventing counts", (payload) => {
    expect(() => parseManagementOverview(payload)).toThrow();
  });
  it.each([{ ...backendTask, leadTimeStatus: "Unknown" }, { ...backendTask, deadlineAt: "invalid" },
    { ...backendTask, wasOverdue: 1 }, { ...backendTask, area: "Unknown" }])("rejects malformed tasks", (payload) => {
    expect(() => parseManagementTasks([payload])).toThrow();
  });
});
