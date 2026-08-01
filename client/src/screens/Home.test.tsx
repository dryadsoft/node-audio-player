import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    jest.restoreAllMocks();
  });

  it("creates a titled playlist from the empty state", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Home />
      </QueryClientProvider>
    );

    await screen.findAllByText("첫 곡.mp3");
    fireEvent.click(screen.getByRole("button", { name: "새 재생목록" }));
    fireEvent.change(screen.getByLabelText("목록 제목"), {
      target: { value: "수업 목록" },
    });
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));

    await waitFor(() => expect(screen.getAllByText("수업 목록").length).toBeGreaterThan(0));
    expect(window.fetch).toHaveBeenCalledWith(
      "/api/playlists",
      expect.objectContaining({ method: "POST" })
    );
  });
});
