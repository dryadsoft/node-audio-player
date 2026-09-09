import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Attendance from "./Attendance";
import { useAttendance } from "../attendance/workspace";
import { attendanceApi } from "../attendance/api";
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
          { ...term, id: "center", locationId: "loc", weekday: 2, revision: 1 },
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
