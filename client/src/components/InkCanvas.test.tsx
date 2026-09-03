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
  pointerId = 1,
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
    pressure: { value: 0.7 },
    tiltX: { value: 2 },
    tiltY: { value: -1 },
  });
  return event;
};

const prepareTouchViewport = () => {
  const viewport = document.querySelector(".ink-scroll-viewport") as HTMLDivElement;
  Object.assign(viewport, {
    setPointerCapture: jest.fn(),
    hasPointerCapture: jest.fn().mockReturnValue(true),
    releasePointerCapture: jest.fn(),
    scrollBy: jest.fn(),
  });
  return viewport;
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
    prepareTouchViewport();
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
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
      page: 0,
      color: "#111827",
      width: 4,
      points: [
        [0.1, 0.2, 0.7, expect.any(Number), 2, -1],
        [0.2, 0.3, 0.7, expect.any(Number), 2, -1],
      ],
    });
    expect(onChange.mock.calls[0][0]).toMatchObject({
      version: 2,
      pageCount: 2,
    });
  });

  it("records consecutive Pencil strokes", () => {
    const onChange = jest.fn();
    render(<InkCanvas document={emptyDocument} onChange={onChange} />);
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
    Object.assign(canvas, {
      setPointerCapture: jest.fn(),
      hasPointerCapture: jest.fn().mockReturnValue(true),
      releasePointerCapture: jest.fn(),
    });

    fireEvent(canvas, pointerEvent("pointerdown", "pen", 40, 60, 1));
    fireEvent(canvas, pointerEvent("pointerup", "pen", 80, 90, 1));
    fireEvent(canvas, pointerEvent("pointerdown", "pen", 120, 130, 2));
    fireEvent(canvas, pointerEvent("pointerup", "pen", 160, 170, 2));

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0].strokes).toHaveLength(2);
  });

  it("recovers an unfinished Pencil stroke when the next stroke starts", () => {
    const onChange = jest.fn();
    render(<InkCanvas document={emptyDocument} onChange={onChange} />);
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
    Object.assign(canvas, {
      setPointerCapture: jest.fn(),
      hasPointerCapture: jest.fn().mockReturnValue(true),
      releasePointerCapture: jest.fn(),
    });

    fireEvent(canvas, pointerEvent("pointerdown", "pen", 40, 60, 7));
    fireEvent(canvas, pointerEvent("pointermove", "pen", 80, 90, 7));
    fireEvent(canvas, pointerEvent("pointerdown", "pen", 120, 130, 7));
    fireEvent(canvas, pointerEvent("pointerup", "pen", 160, 170, 7));

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0].strokes).toHaveLength(2);
  });

  it("commits a Pencil stroke only once for duplicate finish events", () => {
    const onChange = jest.fn();
    render(<InkCanvas document={emptyDocument} onChange={onChange} />);
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
    Object.assign(canvas, {
      setPointerCapture: jest.fn(),
      hasPointerCapture: jest.fn().mockReturnValue(true),
      releasePointerCapture: jest.fn(),
    });

    fireEvent(canvas, pointerEvent("pointerdown", "pen", 40, 60, 9));
    fireEvent(canvas, pointerEvent("pointerup", "pen", 80, 90, 9));
    fireEvent(canvas, pointerEvent("pointercancel", "pen", 80, 90, 9));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].strokes).toHaveLength(1);
  });

  it("adds a page after writing near the bottom of the last page", () => {
    const onChange = jest.fn();
    render(<InkCanvas document={emptyDocument} onChange={onChange} />);
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 2페이지");
    Object.assign(canvas, {
      setPointerCapture: jest.fn(),
      hasPointerCapture: jest.fn().mockReturnValue(true),
      releasePointerCapture: jest.fn(),
    });

    fireEvent(canvas, pointerEvent("pointerdown", "pen", 80, 270));
    fireEvent(canvas, pointerEvent("pointerup", "pen", 80, 270));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 2,
        pageCount: 3,
        strokes: [expect.objectContaining({ page: 1 })],
      }),
    );
  });

  it("keeps an active Pencil stroke separate from touch pointers", () => {
    const onChange = jest.fn();
    render(<InkCanvas document={emptyDocument} onChange={onChange} />);
    prepareTouchViewport();
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
    Object.assign(canvas, {
      setPointerCapture: jest.fn(),
      hasPointerCapture: jest.fn().mockReturnValue(true),
      releasePointerCapture: jest.fn(),
    });

    fireEvent(canvas, pointerEvent("pointerdown", "pen", 40, 60, 7));
    fireEvent(canvas, pointerEvent("pointerdown", "touch", 50, 70, 8));
    fireEvent(canvas, pointerEvent("pointercancel", "touch", 50, 70, 8));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent(canvas, pointerEvent("pointermove", "pen", 80, 90, 7));
    fireEvent(canvas, pointerEvent("pointerup", "pen", 80, 90, 7));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].strokes[0].points).toHaveLength(2);
  });

  it("pans with one finger and pinches only the ink pages", () => {
    render(<InkCanvas document={emptyDocument} onChange={jest.fn()} />);
    const viewport = prepareTouchViewport();
    const scrollBy = jest.fn();
    Object.assign(viewport, {
      scrollBy,
      scrollLeft: 0,
      scrollTop: 0,
    });

    fireEvent(viewport, pointerEvent("pointerdown", "touch", 20, 30, 11));
    fireEvent(viewport, pointerEvent("pointermove", "touch", 10, 10, 11));
    expect(scrollBy).toHaveBeenCalledWith(10, 20);

    fireEvent(viewport, pointerEvent("pointerdown", "touch", 110, 10, 12));
    fireEvent(viewport, pointerEvent("pointermove", "touch", 210, 10, 12));
    expect(screen.getByLabelText("필기 확대 100%로 초기화")).toHaveTextContent(
      "200%",
    );
    const stage = document.querySelector(".ink-zoom-stage") as HTMLDivElement;
    const pages = document.querySelector(".ink-pages-layer") as HTMLDivElement;
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
    expect(stage).toHaveStyle({ width: "1960px" });
    expect(pages).toHaveStyle({ transform: "scale(2)" });
    expect(pages).toContainElement(canvas);
  });

  it("opens and closes the ink-only fullscreen mode", () => {
    render(<InkCanvas document={emptyDocument} onChange={jest.fn()} />);

    fireEvent.click(screen.getByLabelText("필기 전체화면 열기"));
    expect(screen.getByLabelText("Pencil 자유 필기")).toHaveClass(
      "ink-editor-fullscreen",
    );
    expect(document.body).toHaveClass("ink-fullscreen-open");

    fireEvent.click(screen.getByLabelText("필기 전체화면 닫기"));
    expect(screen.getByLabelText("Pencil 자유 필기")).not.toHaveClass(
      "ink-editor-fullscreen",
    );
  });
});
