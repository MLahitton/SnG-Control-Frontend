import { ApiError } from "@/lib/api/apiError";
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ItemImage } from "@/features/quotationViews/ItemImage";
import { quotationViewService } from "@/features/quotationViews/service";
vi.mock("@/features/auth/hooks/useApiClient", () => { const api = {}; return { useApiClient: () => api }; });
vi.mock("@/features/quotationViews/service", () => ({ quotationViewService: { image: vi.fn() } }));
const fetchImage = vi.mocked(quotationViewService.image);
const create = vi.fn(), revoke = vi.fn();
beforeEach(() => {
  fetchImage.mockReset().mockResolvedValue(new Blob(["image"], { type: "image/png" }));
  let serial = 0; create.mockReset().mockImplementation(() => `blob:${++serial}`); revoke.mockReset();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
});
const card = (itemId = "a", projectId = "project") => <ItemImage projectId={projectId} itemId={itemId} number={itemId} />;
it("loads again after section changes/reload but keeps the URL during ordinary rerenders", async () => {
  let view = render(card()); await screen.findByRole("img");
  view.rerender(card()); expect(fetchImage).toHaveBeenCalledTimes(1); expect(revoke).not.toHaveBeenCalled();
  view.unmount(); expect(revoke).toHaveBeenCalledWith("blob:1");
  view = render(card()); expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:2");
  expect(fetchImage).toHaveBeenCalledTimes(2); view.unmount();
});
it("never displays a previous item or a late response after identity changes", async () => {
  let resolve!: (blob: Blob) => void;
  fetchImage.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const view = render(card()); view.rerender(card("b", "other"));
  expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:1");
  await act(async () => resolve(new Blob(["old"])));
  expect(create).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("img")).toHaveAttribute("alt", "Imagen confirmada del ítem b");
  view.rerender(card("c")); expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:2");
  expect(revoke).toHaveBeenCalledWith("blob:1");
});
it("independent cards, including shared images, do not revoke each other's URL", async () => {
  const view = render(<>{card()}{card()}{card("b")}</>);
  await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(3));
  expect(screen.getAllByRole("img").map(i => i.getAttribute("src"))).toEqual(["blob:1", "blob:2", "blob:3"]);
  expect(revoke).not.toHaveBeenCalled(); view.unmount();
  expect(revoke.mock.calls.flat().sort()).toEqual(["blob:1", "blob:2", "blob:3"]);
});
it("shows network/missing/decode errors and retries without showing a stale image", async () => {
  fetchImage.mockRejectedValueOnce(new Error("unavailable"));
  render(card()); await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Volver a cargar" }));
  const img = await screen.findByRole("img"); fireEvent.error(img);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Volver a cargar" }));
  expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:2");
  expect(revoke).toHaveBeenCalledWith("blob:1");
});
it("survives StrictMode effect replay and discards responses after unmount", async () => {
  const view = render(<StrictMode>{card()}</StrictMode>);
  await screen.findByRole("img");
  expect(create).toHaveBeenCalledTimes(1);
  view.unmount(); expect(revoke).toHaveBeenCalledTimes(1);
  let resolve!: (blob: Blob) => void;
  fetchImage.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const other = render(card()); other.unmount();
  await act(async () => resolve(new Blob(["late"])));
  expect(create).toHaveBeenCalledTimes(1);
});

it("distinguishes a genuinely absent historical image from a network failure", async () => {
  fetchImage.mockRejectedValueOnce(new ApiError(404));
  render(card());
  expect(await screen.findByText("Sin imagen persistida para el ítem a.")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
