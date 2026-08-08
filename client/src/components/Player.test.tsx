import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import Player from "./Player";

describe("Player", () => {
  beforeEach(() => {
    jest.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    jest
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("routes a WMA track through the MP3 cache endpoint", () => {
    render(
      <Player
        track={{ path: "수업 음악/첫 곡.WMA", name: "첫 곡.WMA" }}
      />
    );
    const audio = screen.getByLabelText("오디오 플레이어");
    const source = screen.getByTestId("audio-source") as HTMLSourceElement;

    expect(source.getAttribute("src")).toBe(
      `/api/audio?path=${encodeURIComponent("수업 음악/첫 곡.WMA")}`
    );
    expect(source.type).toBe("audio/mpeg");
    expect(screen.getByRole("status")).toHaveTextContent(
      "WMA 재생 준비 중: 첫 곡.WMA"
    );

    fireEvent.canPlay(audio);
    expect(screen.getByRole("status")).toHaveTextContent("첫 곡.WMA");
  });

  it("keeps regular audio on the encoded static songs path", () => {
    render(
      <Player
        track={{ path: "한국 음악/둘째 곡.mp3", name: "둘째 곡.mp3" }}
      />
    );
    const source = screen.getByTestId("audio-source") as HTMLSourceElement;

    expect(source.getAttribute("src")).toBe(
      `/songs/${encodeURIComponent("한국 음악")}/${encodeURIComponent(
        "둘째 곡.mp3"
      )}`
    );
    expect(source.type).toBe("audio/mpeg");
  });

  it("shows a clear WMA preparation error", () => {
    render(
      <Player track={{ path: "실패.wma", name: "실패.wma" }} />
    );
    const audio = screen.getByLabelText("오디오 플레이어");

    fireEvent.error(audio);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "WMA 재생 준비에 실패했습니다. 서버의 FFmpeg 설정을 확인하세요."
    );
  });

  it("ignores a rejected play promise from a previously selected track", async () => {
    let rejectFirstPlay: (error: DOMException) => void = () => {};
    (HTMLMediaElement.prototype.play as jest.Mock)
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectFirstPlay = reject;
          })
      )
      .mockResolvedValueOnce(undefined);
    const { rerender } = render(
      <Player track={{ path: "첫 곡.wma", name: "첫 곡.wma" }} />
    );

    rerender(<Player track={{ path: "둘째 곡.mp3", name: "둘째 곡.mp3" }} />);
    await act(async () => {
      rejectFirstPlay(new DOMException("aborted", "NotAllowedError"));
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent("둘째 곡.mp3");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
