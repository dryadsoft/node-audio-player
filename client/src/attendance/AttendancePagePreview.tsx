import { useEffect, useState } from "react";
import { InkNoteBackground } from "@dryadsoft/react-ink-canvas";
import { useAttendance } from "./workspace";
export default function AttendancePagePreview({ pageId }: { pageId: string }) {
  const state = useAttendance(),
    record = state.pages.find((p) => p.id === pageId);
  const [photo, setPhoto] = useState(""),
    [error, setError] = useState("");
  const note = record?.local.pageType === "note",
    ready = record?.photoReady;
  useEffect(() => {
    state.workspace.want(pageId);
  }, [state.workspace, pageId]);
  useEffect(() => {
    let live = true,
      url = "";
    setPhoto("");
    setError("");
    if (!note && ready)
      void state.workspace.store
        .photo(pageId)
        .then((blob) => {
          if (blob && live) {
            url = URL.createObjectURL(blob);
            setPhoto(url);
          }
        })
        .catch(() => {
          if (live) setError("사진을 읽지 못했습니다.");
        });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [state.workspace, pageId, note, ready]);
  if (error) return <p role="alert">{error}</p>;
  if (!record || (!note && !photo)) return <p>미리보기를 준비하고 있습니다.</p>;
  return (
    <section aria-label="페이지 미리보기">
      <p>읽기 전용 미리보기</p>
      <div
        className="attendance-preview"
        style={{
          aspectRatio: String(record.local.width / record.local.height),
        }}
      >
        {note ? (
          <InkNoteBackground
            aspectRatio={record.local.inkDocument.aspectRatio}
          />
        ) : (
          <img src={photo} alt="출석부 미리보기" />
        )}
        <svg viewBox="0 0 1 1" preserveAspectRatio="none">
          {record.local.inkDocument.strokes.map((s) =>
            s.points.length === 1 ? (
              <circle
                key={s.id}
                cx={s.points[0][0]}
                cy={s.points[0][1]}
                r={s.width / 1000}
                fill={s.color}
              />
            ) : (
              <polyline
                key={s.id}
                points={s.points.map((p) => `${p[0]},${p[1]}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width / 500}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )
          )}
        </svg>
      </div>
    </section>
  );
}
