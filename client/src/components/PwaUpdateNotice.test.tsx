import "@testing-library/jest-dom";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "react-query";
import PwaUpdateNotice from "./PwaUpdateNotice";
import { applyPwaUpdate } from "../offline/pwa";
import { addUpdateGuard } from "../offline/updateGuard";
let mockCanNavigate = true;
let mockUnsaved = 0;
let mockStorageError = "";
jest.mock("../offline/useNoteWorkspace", () => ({
  useNoteWorkspace: () => ({
    workspace: {
      canNavigate: () => mockCanNavigate,
      getSnapshot: () => ({ storageError: mockStorageError }),
    },
  }),
}));
jest.mock("../attendance/workspace", () => ({
  useAttendance: () => ({
    workspace: {
      getSnapshot: () => ({ unsaved: mockUnsaved, storageError: "" }),
    },
  }),
}));
jest.mock("../offline/pwa", () => ({
  appBuildId: "A",
  pwaState: () => "update",
  subscribePwa: () => () => undefined,
  applyPwaUpdate: jest.fn(async (guard) => guard()),
}));
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PwaUpdateNotice />
    </QueryClientProvider>
  );
beforeEach(() => {
  mockCanNavigate = true;
  mockUnsaved = 0;
  mockStorageError = "";
  jest.clearAllMocks();
});
afterEach(cleanup);
it.each(["note", "attendance", "quota"])(
  "blocks reload when %s has unstored input",
  async (kind) => {
    if (kind === "note") mockCanNavigate = false;
    if (kind === "attendance") mockUnsaved = 1;
    if (kind === "quota") mockStorageError = "기기 저장 실패";
    mount();
    fireEvent.click(screen.getByRole("button", { name: "새 버전 적용" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("기기 저장");
    expect(applyPwaUpdate).not.toHaveBeenCalled();
  }
);
it("allows locally persisted records without requiring server sync", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "새 버전 적용" }));
  await waitFor(() => expect(applyPwaUpdate).toHaveBeenCalledTimes(1));
});
it("keeps an open editor and allows applying after it closes", async () => {
  const remove = addUpdateGuard(() => "편집 창을 닫아 주세요.");
  mount();
  fireEvent.click(screen.getByRole("button", { name: "새 버전 적용" }));
  expect(screen.getByRole("alert")).toHaveTextContent("편집 창");
  expect(applyPwaUpdate).not.toHaveBeenCalled();
  remove();
  fireEvent.click(screen.getByRole("button", { name: "새 버전 적용" }));
  await waitFor(() => expect(applyPwaUpdate).toHaveBeenCalledTimes(1));
});
