import "@testing-library/jest-dom";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "react-query";
import { MemoryRouter } from "react-router-dom";
import {
  THEME_STORAGE_KEY,
  ThemeProvider,
} from "../context/ThemeContext";
import Home from "./Home";

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response);

describe("Home", () => {
  beforeEach(() => {
    window.localStorage.clear();
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
        return jsonResponse({
          directory: [],
          playlist: [{ name: "첫 곡.mp3" }],
        });
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
        <ThemeProvider>
          <MemoryRouter>
            <Home />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };

  it("switches to light mode and saves the selection", async () => {
    renderHome();

    fireEvent.click(
      screen.getByRole("button", { name: "라이트 모드로 전환" })
    );

    expect(
      screen.getByRole("button", { name: "다크 모드로 전환" })
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute("data-theme", "light")
    );
  });

  it("creates a titled playlist from the empty state", async () => {
    jest.useFakeTimers();
    renderHome();

    await screen.findAllByText("첫 곡.mp3");
    fireEvent.click(screen.getByRole("button", { name: "새 재생목록" }));
    fireEvent.change(screen.getByLabelText("목록 제목"), {
      target: { value: "수업 목록" },
    });
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));

    await waitFor(() =>
      expect(screen.getAllByText("수업 목록").length).toBeGreaterThan(0)
    );
    expect(
      screen.getByText("‘수업 목록’ 목록을 만들었습니다.")
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2999);
    });
    expect(
      screen.getByText("‘수업 목록’ 목록을 만들었습니다.")
    ).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(
      screen.queryByText("‘수업 목록’ 목록을 만들었습니다.")
    ).not.toBeInTheDocument();

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
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("목록 생성 실패")
    );
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
    expect(
      screen.queryByText("‘수업 목록’ 목록을 만들었습니다.")
    ).not.toBeInTheDocument();
  });

  it("clears the search term and returns to the library", async () => {
    renderHome();
    const searchInput = screen.getByLabelText("노래 제목 검색");

    expect(
      screen.queryByRole("button", { name: "검색어 지우기" })
    ).not.toBeInTheDocument();
    fireEvent.change(searchInput, { target: { value: "여름 노래" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(
      screen.getByRole("heading", { name: "검색 결과" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect(searchInput).toHaveValue("");
    expect(
      screen.getByRole("heading", { name: "음악 보관함" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "검색어 지우기" })
    ).not.toBeInTheDocument();
    expect(searchInput).toHaveFocus();
  });

  it("polls MP3 ZIP preparation and starts the ready download", async () => {
    const playlist = {
      id: "playlist-download",
      title: "수업 음악",
      tracks: [
        {
          path: "수업 음악/01.하이헬로.wma",
          name: "01.하이헬로.wma",
          available: true,
        },
      ],
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
    };
    (window.fetch as jest.Mock).mockImplementation(
      (input: RequestInfo, options?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/playlist?")) {
          return jsonResponse({ directory: [], playlist: [] });
        }
        if (url === "/api/playlists") {
          return jsonResponse([playlist]);
        }
        if (
          url === "/api/playlists/playlist-download/downloads" &&
          options?.method === "POST"
        ) {
          return jsonResponse({
            id: "download-1",
            playlistId: playlist.id,
            status: "queued",
            completed: 0,
            total: 1,
          });
        }
        if (url === "/api/playlist-downloads/download-1") {
          return jsonResponse({
            id: "download-1",
            playlistId: playlist.id,
            status: "ready",
            completed: 1,
            total: 1,
            fileName: "수업 음악.zip",
          });
        }
        return jsonResponse([]);
      }
    );
    const anchorClick = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    renderHome();

    const downloadButton = await screen.findByRole("button", {
      name: "수업 음악 MP3 ZIP 다운로드",
    });
    jest.useFakeTimers();
    fireEvent.click(downloadButton);
    await act(async () => {
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    });
    expect(screen.getByText("준비 중 0/1")).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(1000);
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    });

    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("MP3 ZIP 다운로드를 시작했습니다.")
    ).toBeInTheDocument();
    expect(window.fetch).toHaveBeenCalledWith(
      "/api/playlist-downloads/download-1",
      expect.any(Object)
    );
  });
});
