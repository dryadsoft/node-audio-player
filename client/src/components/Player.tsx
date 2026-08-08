import React, { useEffect, useRef, useState } from "react";
import { TrackReference } from "../types";

const musicTypes: Record<string, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  aac: "audio/aac",
  wav: "audio/x-wav",
};

const getExtension = (path: string) =>
  path.substring(path.lastIndexOf(".") + 1).toLowerCase();

const encodeStaticMusicPath = (path: string) =>
  ["songs", ...path.split("/").filter(Boolean)]
    .map(encodeURIComponent)
    .join("/");

const getSource = (path: string) => {
  const extension = getExtension(path);
  if (extension === "wma") {
    return {
      src: `/api/audio?path=${encodeURIComponent(path)}`,
      type: "audio/mpeg",
      requiresPreparation: true,
    };
  }
  return {
    src: `/${encodeStaticMusicPath(path)}`,
    type: musicTypes[extension] || "",
    requiresPreparation: false,
  };
};

interface PlayerProps {
  track?: TrackReference;
}

type PlaybackStatus = "idle" | "preparing" | "ready" | "error";

const Player: React.FC<PlayerProps> = ({ track }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sourceRef = useRef<HTMLSourceElement>(null);
  const currentSourceRef = useRef("");
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const trackPath = track?.path || "";
  const trackName = track?.name || "";

  useEffect(() => {
    const audio = audioRef.current;
    const sourceElement = sourceRef.current;
    if (!audio || !sourceElement) return;

    if (!trackPath) {
      const hadSource = Boolean(currentSourceRef.current);
      currentSourceRef.current = "";
      sourceElement.removeAttribute("src");
      sourceElement.removeAttribute("type");
      if (hadSource) {
        audio.pause();
        audio.load();
      }
      setStatus("idle");
      setErrorMessage("");
      return;
    }

    const source = getSource(trackPath);
    currentSourceRef.current = source.src;

    const updateIfCurrent = (callback: () => void) => {
      if (currentSourceRef.current === source.src) callback();
    };
    const handleCanPlay = () =>
      updateIfCurrent(() => {
        setStatus("ready");
        setErrorMessage("");
      });
    const handleError = () =>
      updateIfCurrent(() => {
        setStatus("error");
        setErrorMessage(
          source.requiresPreparation
            ? "WMA 재생 준비에 실패했습니다. 서버의 FFmpeg 설정을 확인하세요."
            : "오디오 파일을 재생하지 못했습니다."
        );
      });

    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("playing", handleCanPlay);
    audio.addEventListener("error", handleError);
    audio.pause();
    sourceElement.src = source.src;
    sourceElement.type = source.type;
    setStatus(source.requiresPreparation ? "preparing" : "ready");
    setErrorMessage("");
    audio.load();
    const playPromise = audio.play();
    playPromise?.catch((error: DOMException) => {
      if (error.name === "AbortError") return;
      updateIfCurrent(() => {
        setStatus("error");
        setErrorMessage(
          error.name === "NotAllowedError"
            ? "자동 재생이 차단되었습니다. 재생 버튼을 눌러주세요."
            : "오디오 파일을 재생하지 못했습니다."
        );
      });
    });

    return () => {
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("playing", handleCanPlay);
      audio.removeEventListener("error", handleError);
    };
  }, [trackName, trackPath]);

  const nowPlaying =
    status === "preparing"
      ? `WMA 재생 준비 중: ${trackName}`
      : status === "error"
      ? errorMessage
      : trackName || "재생중인 노래가 없습니다.";

  return (
    <>
      <div className="player-controls">
        <audio
          ref={audioRef}
          preload="metadata"
          controls
          aria-label="오디오 플레이어"
        >
          <source ref={sourceRef} src="" data-testid="audio-source" />
        </audio>
      </div>
      <div
        className={`now-playing ${status}`}
        role={status === "error" ? "alert" : "status"}
        aria-live={status === "error" ? "assertive" : "polite"}
      >
        <span>{nowPlaying}</span>
      </div>
    </>
  );
};

export default Player;
