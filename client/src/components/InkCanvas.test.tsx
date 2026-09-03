import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import InkCanvas from "./InkCanvas";
import { InkDocumentV1 } from "../types";

const emptyDocument: InkDocumentV1 = {
  version: 1,
  aspectRatio: 4 / 3,
  strokes: [],
};

const pointerEvent = (
  type: string,
  pointerType: "pen" | "touch",
  clientX: number,
  clientY: number,
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    pointerId: { value: 1 },
    clientX: { value: clientX },
    clientY: { value: clientY },
    pressure: { value: 0.7 },
    tiltX: { value: 2 },
    tiltY: { value: -1 },
  });
  return event;
};

describe("InkCanvas", () => {
  beforeEach(() => {
    const context = {
      setTransform: jest.fn(),
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
    } as unknown as CanvasRenderingContext2D;
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context);
    jest
      .spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 400,
        bottom: 300,
        width: 400,
        height: 300,
        toJSON: () => ({}),
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("records Pencil strokes but ignores touch input", () => {
    const onChange = jest.fn();
    render(<InkCanvas document={emptyDocument} onChange={onChange} />);
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역");
    Object.assign(canvas, {
      setPointerCapture: jest.fn(),
      hasPointerCapture: jest.fn().mockReturnValue(true),
      releasePointerCapture: jest.fn(),
    });

    fireEvent(canvas, pointerEvent("pointerdown", "touch", 20, 30));
    fireEvent(canvas, pointerEvent("pointerup", "touch", 20, 30));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent(canvas, pointerEvent("pointerdown", "pen", 40, 60));
    fireEvent(canvas, pointerEvent("pointermove", "pen", 80, 90));
    fireEvent(canvas, pointerEvent("pointerup", "pen", 80, 90));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].strokes[0]).toMatchObject({
      color: "#111827",
      width: 4,
      points: [
        [0.1, 0.2, 0.7, expect.any(Number), 2, -1],
        [0.2, 0.3, 0.7, expect.any(Number), 2, -1],
      ],
    });
  });
});
