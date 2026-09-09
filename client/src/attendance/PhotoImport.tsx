import { useDialogFocus } from "./useDialogFocus";
import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  Corner,
  decodePhoto,
  fullCorners,
  preparePhoto,
  rotatedCanvas,
} from "./photo";
export default function PhotoImport({
  file,
  onClose,
  onSave,
}: {
  file: File;
  onClose: () => void;
  onSave: (blob: Blob, width: number, height: number) => Promise<void>;
}) {
  const [image, setImage] = useState<HTMLImageElement>(),
    [rotation, setRotation] = useState(0),
    [corners, setCorners] = useState<Corner[]>(fullCorners),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useDialogFocus(true);
  const canvas = useRef<HTMLCanvasElement>(),
    bounds = useRef<HTMLDivElement>(null),
    drag = useRef<number>();
  useEffect(() => {
    let live = true;
    void decodePhoto(file)
      .then((i) => {
        if (live) setImage(i);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [file]);
  useEffect(() => {
    if (!image) return;
    const c = rotatedCanvas(image, rotation);
    canvas.current = c;
    setPreview(c.toDataURL("image/jpeg", 0.85));
    setCorners(fullCorners);
  }, [image, rotation]);
  useEffect(() => {
    if (!busy) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy]);
  const move = (e: React.PointerEvent) => {
    if (drag.current === undefined || !bounds.current) return;
    const r = bounds.current.getBoundingClientRect(),
      index = drag.current;
    setCorners((old) =>
      old.map((p, i) =>
        i === index
          ? {
              x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
              y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
            }
          : p
      )
    );
  };
  const save = async () => {
    if (!canvas.current) return;
    setBusy(true);
    setError("");
    try {
      const result = await preparePhoto(canvas.current, corners);
      await onSave(result.blob, result.width, result.height);
    } catch (e) {
      setError(e instanceof Error ? e.message : "등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="attendance-overlay">
      <section
        className="attendance-import"
        role="dialog"
        aria-modal="true"
        aria-label="출석부 사진 보정"
      >
        <header>
          <strong>종이의 네 모서리를 맞춰주세요</strong>
          <button disabled={busy} onClick={onClose}>
            취소
          </button>
        </header>
        <div className="attendance-import-scroll">
          {preview && (
            <div
              ref={bounds}
              className="attendance-crop"
              style={
                {
                  "--photo-ratio": canvas.current
                    ? canvas.current.width / canvas.current.height
                    : 0.7,
                } as CSSProperties
              }
              onPointerMove={move}
              onPointerUp={() => {
                drag.current = undefined;
              }}
              onPointerCancel={() => {
                drag.current = undefined;
              }}
            >
              <img src={preview} alt="등록 전 출석부 사진" draggable={false} />
              <svg viewBox="0 0 1 1" preserveAspectRatio="none">
                <polygon
                  points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
                />
              </svg>
              {corners.map((p, i) => (
                <button
                  key={i}
                  disabled={busy}
                  className="attendance-corner"
                  aria-label={`${i + 1}번 모서리`}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  onPointerDown={(e) => {
                    drag.current = i;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onKeyDown={(e) => {
                    const d: Record<string, Corner> = {
                      ArrowLeft: { x: -0.005, y: 0 },
                      ArrowRight: { x: 0.005, y: 0 },
                      ArrowUp: { x: 0, y: -0.005 },
                      ArrowDown: { x: 0, y: 0.005 },
                    };
                    if (d[e.key]) {
                      e.preventDefault();
                      setCorners((old) =>
                        old.map((v, n) =>
                          n === i
                            ? {
                                x: Math.max(0, Math.min(1, v.x + d[e.key].x)),
                                y: Math.max(0, Math.min(1, v.y + d[e.key].y)),
                              }
                            : v
                        )
                      );
                    }
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button
            disabled={busy || !image}
            onClick={() => setRotation((rotation + 90) % 360)}
          >
            90° 회전
          </button>
          <button disabled={busy} onClick={() => setCorners(fullCorners)}>
            영역 초기화
          </button>
          <button
            className="primary"
            disabled={busy || !image}
            onClick={() => void save()}
          >
            {busy ? "보정·저장 중…" : "사진 추가"}
          </button>
        </footer>
      </section>
    </div>
  );
}
