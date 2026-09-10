import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Attendance from "./Attendance";
import { useAttendance } from "../attendance/workspace";
import { attendanceApi, AttendanceError } from "../attendance/api";
import { AttendanceState } from "../attendance/workspace";
jest.mock("../attendance/workspace", () => ({ useAttendance: jest.fn() }));
jest.mock("@dryadsoft/react-ink-canvas", () => ({
  InkCanvas: (p: any) => (
    <div aria-label="사진 위 필기" data-fixed={p.fixedPage}>
      <img src={p.backgroundImage} alt="필기 배경" />
    </div>
  ),
}));
let state: AttendanceState, workspace: any;
beforeEach(() => {
  const term = { year: 2026, term: "fall" as const },
    meta = {
      id: "page",
      periodId: "p1",
      imageHash: "h",
      width: 100,
      height: 140,
      position: 0,
      revision: 2,
      deletedAt: "remote-trash",
      updatedAt: "t",
    };
  state = {
    pages: [
      {
        id: "page",
        semester: term,
        local: {
          ...meta,
          revision: 1,
          deletedAt: null,
          inkDocument: {
            version: 2,
            pageCount: 1,
            aspectRatio: 100 / 140,
            strokes: [],
          },
        },
        dirty: true,
        version: 1,
        conflicts: [],
        photoReady: true,
        remoteDeleted: true,
      },
    ],
    catalogs: [
      {
        semester: term,
        locations: [
          {
            id: "loc",
            name: "센터",
            active: true,
            createdAt: "t",
            updatedAt: "t",
          },
        ],
        centers: [
          {
            ...term,
            id: "center",
            locationId: "loc",
            weekday: 2,
            revision: 1,
            deletedAt: null,
          },
        ],
        periods: Array.from({ length: 6 }, (_, i) => ({
          id: `p${i + 1}`,
          centerId: "center",
          name: `${i + 1}교시`,
          position: i,
          revision: 1,
          deletedAt: null,
        })),
        pages: [meta],
      },
    ],
    target: term,
    hydrated: true,
    busy: false,
    online: true,
    auth: false,
    error: "",
    storageError: "",
    unsaved: 0,
  };
  workspace = {
    setView: jest.fn(),
    want: jest.fn(),
    refresh: jest.fn().mockResolvedValue(undefined),
    store: { photo: jest.fn().mockResolvedValue(new Blob(["photo"])) },
    setTarget: jest.fn(),
    retry: jest.fn(),
    edit: jest.fn(),
  };
  (useAttendance as jest.Mock).mockImplementation(() => ({
    ...state,
    workspace,
  }));
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: jest.fn(() => "blob:photo"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: jest.fn(),
  });
});
afterEach(() => jest.restoreAllMocks());
it("allows adding the same location on another weekday without changing the selected center", async () => {
  const save = jest
    .spyOn(attendanceApi, "center")
    .mockResolvedValue({
      ...state.catalogs[0].centers[0],
      id: "new",
      weekday: 3,
    });
  render(
    <MemoryRouter>
      <Attendance />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByText(/센터 · 화/));
  fireEvent.change(screen.getByLabelText("이 학기에 센터 추가"), {
    target: { value: "loc" },
  });
  fireEvent.change(screen.getByLabelText("요일"), { target: { value: "2" } });
  expect(
    screen.getByRole("button", { name: "센터 추가", exact: true })
  ).toBeDisabled();
  expect(screen.getByText(/이미 등록된 센터·요일/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("요일"), { target: { value: "3" } });
  expect(screen.getByLabelText("수업 요일")).toHaveValue("2");
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "센터 추가", exact: true })
  );
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      year: 2026,
      term: "fall",
      locationId: "loc",
      weekday: 3,
    })
  );
});
it("refreshes a conflicting weekday edit and keeps the add form independent", async () => {
  const save = jest
    .spyOn(attendanceApi, "center")
    .mockRejectedValue(
      new AttendanceError("이미 등록된 센터·요일입니다.", 409)
    );
  render(
    <MemoryRouter>
      <Attendance />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByText(/센터 · 화/));
  fireEvent.change(screen.getByLabelText("수업 요일"), {
    target: { value: "3" },
  });
  await waitFor(() => expect(workspace.refresh).toHaveBeenCalled());
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ id: "center", weekday: 3, expectedRevision: 1 })
  );
  expect(screen.getByLabelText("요일")).toHaveValue("1");
  expect(screen.getByLabelText("수업 요일")).toHaveValue("2");
  expect(screen.getAllByRole("alert")[0]).toHaveTextContent(
    "이미 등록된 센터·요일"
  );
});
it("trashes and restores only the selected weekday while preserving its periods", async () => {
  state.pages[0].dirty = false;
  state.catalogs[0].centers.push({
    ...state.catalogs[0].centers[0],
    id: "other",
    weekday: 4,
  });
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
  const save = jest
    .spyOn(attendanceApi, "center")
    .mockImplementation(async (input: any) => {
      const changed = {
        ...input,
        revision: input.expectedRevision + 1,
        deletedAt: input.deleted ? "trashed" : null,
      };
      state.catalogs = state.catalogs.map((c) => ({
        ...c,
        centers: c.centers.map((center) =>
          center.id === input.id ? changed : center
        ),
      }));
      return changed;
    });
  const ui = (
    <MemoryRouter>
      <Attendance />
    </MemoryRouter>
  );
  const view = render(ui);
  workspace.refresh.mockImplementation(async () =>
    view.rerender(
      <MemoryRouter>
        <Attendance />
      </MemoryRouter>
    )
  );
  fireEvent.click(await screen.findByText(/센터 · 화/));
  fireEvent.click(screen.getByRole("button", { name: "센터 삭제" }));
  await waitFor(() =>
    expect(screen.getByLabelText("센터 선택")).toHaveValue("other")
  );
  expect(confirm).toHaveBeenCalledWith(
    expect.stringContaining("센터 · 화요일")
  );
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "center",
      deleted: true,
      expectedRevision: 1,
    })
  );
  expect(
    screen.queryByRole("option", { name: "휴지통 · 센터 · 화" })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("휴지통 포함"));
  fireEvent.change(screen.getByLabelText("센터 선택"), {
    target: { value: "center" },
  });
  expect(screen.getByRole("button", { name: "센터 복구" })).toBeEnabled();
  expect(screen.getByLabelText("수업 요일")).toBeDisabled();
  expect(screen.getByLabelText("1교시 이름")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("이 학기에 센터 추가"), {
    target: { value: "loc" },
  });
  fireEvent.change(screen.getByLabelText("요일"), { target: { value: "2" } });
  expect(screen.getByText(/휴지통에 같은 센터·요일/)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "센터 추가", exact: true })
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "센터 복구" }));
  await waitFor(() => expect(screen.getByLabelText("수업 요일")).toBeEnabled());
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id: "center",
      deleted: false,
      expectedRevision: 2,
    })
  );
  expect(state.catalogs[0].periods).toHaveLength(6);
  expect(state.catalogs[0].centers.find((c) => c.id === "other")).toMatchObject(
    { deletedAt: null, revision: 1 }
  );
});
it("shows an empty selection after deleting the last center and respects cancellation", async () => {
  state.pages[0].dirty = false;
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  const save = jest
    .spyOn(attendanceApi, "center")
    .mockImplementation(async (input: any) => {
      const changed = { ...input, revision: 2, deletedAt: "trashed" };
      state.catalogs = [{ ...state.catalogs[0], centers: [changed] }];
      return changed;
    });
  const ui = (
    <MemoryRouter>
      <Attendance />
    </MemoryRouter>
  );
  const view = render(ui);
  workspace.refresh.mockImplementation(async () =>
    view.rerender(
      <MemoryRouter>
        <Attendance />
      </MemoryRouter>
    )
  );
  fireEvent.click(await screen.findByText(/센터 · 화/));
  fireEvent.click(screen.getByRole("button", { name: "센터 삭제" }));
  expect(save).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "센터 삭제" }));
  await waitFor(() =>
    expect(screen.getByLabelText("센터 선택")).toHaveValue("")
  );
  expect(screen.getByText("센터와 교시를 준비하세요")).toBeInTheDocument();
});
it("blocks center deletion during unsent or unsaved work and offline management", async () => {
  const ui = (
    <MemoryRouter>
      <Attendance />
    </MemoryRouter>
  );
  const view = render(ui);
  fireEvent.click(await screen.findByText(/센터 · 화/));
  expect(screen.getByRole("button", { name: "센터 삭제" })).toBeDisabled();
  expect(screen.getByText(/미전송 사진·필기와 기기 저장/)).toBeInTheDocument();
  state.pages[0].dirty = false;
  state.unsaved = 1;
  view.rerender(
    <MemoryRouter>
      <Attendance />
    </MemoryRouter>
  );
  expect(screen.getByRole("button", { name: "센터 삭제" })).toBeDisabled();
  state.unsaved = 0;
  state.online = false;
  view.rerender(
    <MemoryRouter>
      <Attendance />
    </MemoryRouter>
  );
  expect(screen.getByRole("button", { name: "센터 삭제" })).toBeDisabled();
  expect(screen.getByLabelText("수업 요일")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "센터 추가", exact: true })
  ).toBeDisabled();
});
it("allows arbitrary periods without time inputs and editing a year", async () => {
  render(
    <MemoryRouter>
      <Attendance />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByText(/센터 · 화/));
  expect(
    screen.getByRole("button", { name: "6교시", exact: true })
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("시작 시간")).not.toBeInTheDocument();
  const year = screen.getByLabelText("연도");
  fireEvent.change(year, { target: { value: "" } });
  fireEvent.change(year, { target: { value: "2027" } });
  expect(workspace.setView).toHaveBeenLastCalledWith({
    year: 2027,
    term: "fall",
  });
});
it("allows restoring remote trash with pending local ink using the remote revision", async () => {
  const change = jest
    .spyOn(attendanceApi, "changePage")
    .mockResolvedValue({} as any);
  render(
    <MemoryRouter>
      <Attendance />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByText(/센터 · 화/));
  fireEvent.click(screen.getByRole("checkbox", { name: "휴지통 포함" }));
  const restore = await screen.findByRole("button", {
    name: "복구",
    exact: true,
  });
  expect(restore).toBeEnabled();
  fireEvent.click(restore);
  await waitFor(() =>
    expect(change).toHaveBeenCalledWith("page", {
      deleted: false,
      expectedRevision: 2,
    })
  );
});
it("renders the image as the fixed ink background rather than a separate notes field", async () => {
  state.pages[0].remoteDeleted = false;
  state.pages[0].dirty = false;
  state.catalogs[0].pages[0].deletedAt = null;
  render(
    <MemoryRouter>
      <Attendance />
    </MemoryRouter>
  );
  expect(await screen.findByAltText("필기 배경")).toHaveAttribute(
    "src",
    "blob:photo"
  );
  expect(screen.getByLabelText("사진 위 필기")).toHaveAttribute(
    "data-fixed",
    "true"
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
