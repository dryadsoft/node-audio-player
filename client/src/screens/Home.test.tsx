import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "react-query";
import Home from "./Home";

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response);

describe("Home", () => {
  beforeEach(() => {
    jest.spyOn(window, "fetch").mockImplementation((input, options) => {
      const url = String(input);
      if (url === "/api/playlists" && options?.method === "POST") {
        return jsonResponse({
          id: "playlist-1",
          title: "수업 목록",
          tracks: [],
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        });
      }
      if (url.startsWith("/api/playlist?")) {
        return jsonResponse({ directory: [], playlist: [{ name: "첫 곡.mp3" }] });
      }
      if (url === "/api/playlists") {
        return jsonResponse([]);
      }
      return jsonResponse([]);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const renderHome = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <Home />
      </QueryClientProvider>
    );
  };

  it("creates a titled playlist from the empty state", async () => {
    jest.useFakeTimers();
    renderHome();

    await screen.findAllByText("첫 곡.mp3");
    fireEvent.click(screen.getByRole("button", { name: "새 재생목록" }));
    fireEvent.change(screen.getByLabelText("목록 제목"), {
      target: { value: "수업 목록" },
    });
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));

    await waitFor(() => expect(screen.getAllByText("수업 목록").length).toBeGreaterThan(0));
    expect(screen.getByText("‘수업 목록’ 목록을 만들었습니다.")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2999);
    });
    expect(screen.getByText("‘수업 목록’ 목록을 만들었습니다.")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText("‘수업 목록’ 목록을 만들었습니다.")).not.toBeInTheDocument();

    expect(window.fetch).toHaveBeenCalledWith(
      "/api/playlists",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("keeps errors for five seconds and restarts the timer for a new error", async () => {
    jest.useFakeTimers();
    (window.fetch as jest.Mock).mockImplementation(
      (input: RequestInfo, options?: RequestInit) => {
        const url = String(input);
        if (url === "/api/playlists" && options?.method === "POST") {
          return jsonResponse({ message: "목록 생성 실패" }, 500);
        }
        if (url.startsWith("/api/playlist?")) {
          return jsonResponse({ directory: [], playlist: [] });
        }
        return jsonResponse([]);
      }
    );
    renderHome();

    fireEvent.click(screen.getByRole("button", { name: "새 재생목록" }));
    fireEvent.change(screen.getByLabelText("목록 제목"), {
      target: { value: "실패 목록" },
    });
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));
    await screen.findByRole("alert");

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("목록 생성 실패"));
    act(() => {
      jest.advanceTimersByTime(4999);
    });
    expect(screen.getByText("목록 생성 실패")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText("목록 생성 실패")).not.toBeInTheDocument();
  });

  it("closes a notice immediately", async () => {
    renderHome();

    await screen.findAllByText("첫 곡.mp3");
    fireEvent.click(screen.getByRole("button", { name: "새 재생목록" }));
    fireEvent.change(screen.getByLabelText("목록 제목"), {
      target: { value: "수업 목록" },
    });
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));
    await screen.findByText("‘수업 목록’ 목록을 만들었습니다.");

    fireEvent.click(screen.getByRole("button", { name: "알림 닫기" }));
    expect(screen.queryByText("‘수업 목록’ 목록을 만들었습니다.")).not.toBeInTheDocument();
  });
});
