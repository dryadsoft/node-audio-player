import { normalizeInk } from "../api/mergeLessonNote";
import { InkDocument } from "../types";
export default function RecoveredInk({ document }: { document: InkDocument }) {
  const ink = normalizeInk(document);
  return (
    <div className="recovered-ink" aria-label="복구 필기">
      {Array.from({ length: ink.pageCount }, (_, page) => (
        <svg
          key={page}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{ aspectRatio: String(ink.aspectRatio) }}
          aria-label={`복구 필기 ${page + 1}페이지`}
        >
          {ink.strokes
            .filter((s) => s.page === page)
            .map((s) =>
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
                  stroke={s.color}
                  strokeWidth={s.width / 500}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              )
            )}
        </svg>
      ))}
    </div>
  );
}
