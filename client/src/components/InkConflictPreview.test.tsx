import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import InkConflictPreview from "./InkConflictPreview";
import { InkStrokeV2 } from "../types";

it("renders each fragment separately and continues to render saved single-stroke conflicts", () => {
  const stroke: InkStrokeV2 = {
    id: "original",
    sourceStrokeId: "original",
    page: 0,
    color: "#111827",
    width: 4,
    points: [
      [0, 0.5, 0.5, 0],
      [0.4, 0.5, 0.5, 1],
    ],
  };
  const other = {
    ...stroke,
    id: "fragment",
    points: [
      [0.6, 0.5, 0.5, 1],
      [1, 0.5, 0.5, 2],
    ],
  } as InkStrokeV2;
  const view = render(<InkConflictPreview value={[stroke, other]} />);
  expect(view.container.querySelectorAll("polyline")).toHaveLength(2);
  view.rerender(<InkConflictPreview value={stroke} />);
  expect(view.container.querySelectorAll("polyline")).toHaveLength(1);
  view.rerender(<InkConflictPreview value={undefined} />);
  expect(screen.getByText("삭제된 획")).toBeInTheDocument();
});
