import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "react-query";
import CenterManager from "./CenterManager";
import { api } from "../api";
import { attendanceWorkspace } from "../attendance/workspace";
const center = {
  id: "center",
  name: "서초센터",
  active: true,
  createdAt: "t",
  updatedAt: "t",
};
afterEach(() => jest.restoreAllMocks());
it("changes status through the shared API and updates all attendance catalogs", async () => {
  let location = { ...center };
  jest.spyOn(api, "lessonLocations").mockImplementation(async () => [location]);
  const update = jest
    .spyOn(api, "updateLessonLocation")
    .mockImplementation(
      async (input) => (location = { ...location, ...input })
    );
  const persist = jest
    .spyOn(attendanceWorkspace, "updateLocations")
    .mockResolvedValue(undefined);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <CenterManager onBack={jest.fn()} onBusyChange={jest.fn()} />
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByRole("button", { name: "사용 중지" }));
  await waitFor(() =>
    expect(persist).toHaveBeenCalledWith([
      expect.objectContaining({ id: "center", active: false }),
    ])
  );
  fireEvent.click(await screen.findByRole("button", { name: "다시 사용" }));
  await waitFor(() =>
    expect(update).toHaveBeenLastCalledWith({ id: "center", active: true })
  );
  await waitFor(() =>
    expect(persist).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "center", active: true }),
    ])
  );
});
it("keeps failed name edits and prevents writes offline", async () => {
  jest.spyOn(api, "lessonLocations").mockResolvedValue([center]);
  const update = jest
    .spyOn(api, "updateLessonLocation")
    .mockRejectedValue(new Error("센터 변경 실패"));
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <CenterManager onBack={jest.fn()} onBusyChange={jest.fn()} />
    </QueryClientProvider>
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "서초센터 이름 변경" })
  );
  fireEvent.change(screen.getByLabelText("서초센터 새 이름"), {
    target: { value: "변경할 이름" },
  });
  fireEvent.click(screen.getByRole("button", { name: "저장", exact: true }));
  await screen.findByText("센터 변경 실패");
  expect(screen.getByLabelText("서초센터 새 이름")).toHaveValue("변경할 이름");
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: false,
  });
  fireEvent(window, new Event("offline"));
  expect(
    screen.getByRole("button", { name: "저장", exact: true })
  ).toBeDisabled();
  expect(update).toHaveBeenCalledTimes(1);
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
