import { choiceStrokes, StrokeChoice } from "../api/inkStrokeGroups";

export default function InkConflictPreview({
  value,
  label = "필기 미리보기",
}: {
  value: StrokeChoice;
  label?: string;
}) {
  const strokes = choiceStrokes(value);
  if (!strokes.length) return <span>삭제된 획</span>;
  return (
    <svg viewBox="0 0 1 1" aria-label={label}>
      {strokes.map((stroke) =>
        stroke.points.length === 1 ? (
          <circle
            key={stroke.id}
            cx={stroke.points[0][0]}
            cy={stroke.points[0][1]}
            r={stroke.width / 1000}
            fill={stroke.color}
          />
        ) : (
          <polyline
            key={stroke.id}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.width / 500}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={stroke.points.map((p) => `${p[0]},${p[1]}`).join(" ")}
          />
        )
      )}
    </svg>
  );
}
