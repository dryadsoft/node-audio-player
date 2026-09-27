import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import ConnectionRecovery from "./ConnectionRecovery";
import { connection, ConnectionState } from "../api/connection";
import { beginAuthRecovery, hasAuthAttempt } from "../offline/authRecovery";
let mockState: ConnectionState;
let mockListener: () => void;
let mockBlocked = false;
let mockGuard = "";
let mockWrites = 0;
const mockNotes = {
  hydrated: true,
  storageError: "",
  saving: [],
  workspace: { canNavigate: () => !mockBlocked, refresh: jest.fn() },
};
const mockAttendance = {
  hydrated: true,
  unsaved: 0,
  storageError: "",
  workspace: { refresh: jest.fn() },
};
const mockQueries = { isMutating: () => 0, invalidateQueries: jest.fn() };
jest.mock("../api/connection", () => ({
  connection: {
    getSnapshot: () => mockState,
    start: () => () => {},
    writes: () => mockWrites,
    subscribe: (f: () => void) => {
      mockListener = f;
      return () => {};
    },
  },
  checkConnection: jest.fn(),
}));
jest.mock("../offline/useNoteWorkspace", () => ({
  useNoteWorkspace: () => mockNotes,
}));
jest.mock("../attendance/workspace", () => ({
  useAttendance: () => mockAttendance,
}));
jest.mock("react-query", () => ({ useQueryClient: () => mockQueries }));
jest.mock("../offline/updateGuard", () => ({
  updateBlockReason: () => mockGuard,
}));
jest.mock("../offline/authRecovery", () => ({
  beginAuthRecovery: jest.fn(() => true),
  hasAuthAttempt: jest.fn(() => false),
  clearAuthAttempt: jest.fn(),
  registerReauthentication: () => () => {},
}));
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockBlocked = false;
  mockGuard = "";
  mockWrites = 0;
  mockAttendance.unsaved = 0;
  mockAttendance.storageError = "";
  mockState = { phase: "auth", episode: 1, message: "expired" };
  (hasAuthAttempt as jest.Mock).mockReturnValue(false);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
});
afterEach(() => jest.useRealTimers());
it("automatically reconnects an idle screen only once", () => {
  render(<ConnectionRecovery />);
  act(() => {
    jest.advanceTimersByTime(200);
  });
  expect(beginAuthRecovery).toHaveBeenCalledTimes(1);
  expect(beginAuthRecovery).toHaveBeenCalledWith(false);
  act(() => {
    jest.advanceTimersByTime(30000);
  });
  expect(beginAuthRecovery).toHaveBeenCalledTimes(1);
});
it("preserves editing and does not unexpectedly navigate after the pen lifts", () => {
  mockBlocked = true;
  const view = render(<ConnectionRecovery />);
  act(() => {
    jest.advanceTimersByTime(200);
  });
  expect(beginAuthRecovery).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "기기에 저장되지 않은 입력"
  );
  mockBlocked = false;
  view.rerender(<ConnectionRecovery />);
  act(() => {
    jest.advanceTimersByTime(200);
  });
  expect(beginAuthRecovery).not.toHaveBeenCalled();
  screen.getByRole("button", { name: "다시 로그인" }).click();
  expect(beginAuthRecovery).toHaveBeenCalledWith(true);
});
it("rechecks safety immediately before navigation", () => {
  render(<ConnectionRecovery />);
  mockBlocked = true;
  act(() => {
    jest.advanceTimersByTime(200);
  });
  expect(beginAuthRecovery).not.toHaveBeenCalled();
});
it("does not auto-login on transport failure or after a failed attempt", () => {
  mockState = { phase: "network", episode: 0, message: "인터넷 연결 실패" };
  render(<ConnectionRecovery />);
  act(() => {
    jest.advanceTimersByTime(200);
  });
  expect(beginAuthRecovery).not.toHaveBeenCalled();
  (hasAuthAttempt as jest.Mock).mockReturnValue(true);
  act(() => {
    mockState = { phase: "auth", episode: 1, message: "expired" };
    mockListener();
  });
  act(() => {
    jest.advanceTimersByTime(200);
  });
  expect(beginAuthRecovery).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "다시 로그인" })).toBeEnabled();
});
it("resumes reads and durable sync after a successful protected probe", () => {
  render(<ConnectionRecovery />);
  act(() => {
    mockState = { phase: "ready", episode: 1, message: "" };
    mockListener();
  });
  expect(connection.getSnapshot().phase).toBe("ready");
  expect(mockQueries.invalidateQueries).toHaveBeenCalledTimes(1);
  expect(mockNotes.workspace.refresh).toHaveBeenCalledWith(true);
  expect(mockAttendance.workspace.refresh).toHaveBeenCalledTimes(1);
});

it.each(["music", "photo", "composition", "write", "storage"])(
  "does not navigate during %s work",
  (work) => {
    if (work === "music" || work === "photo") mockGuard = "작업 중";
    if (work === "composition") mockBlocked = true;
    if (work === "write") mockWrites = 1;
    if (work === "storage") mockAttendance.storageError = "기기 저장 실패";
    render(<ConnectionRecovery />);
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(beginAuthRecovery).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  }
);
