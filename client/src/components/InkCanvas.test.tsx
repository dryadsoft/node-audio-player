import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import InkCanvas from "./InkCanvas";
import { InkDocument, InkDocumentV1 } from "../types";

const emptyDocument: InkDocumentV1 = {
  version: 1,
  aspectRatio: 4 / 3,
  strokes: [],
};

const pointerEvent = (
  type: string,
  pointerType: "pen" | "touch" | "mouse",
  clientX: number,
  clientY: number,
  pointerId = 1,
  pressure = 0.7,
  buttons = 1,
  timeStamp?: number,
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const properties: PropertyDescriptorMap = {
    pointerType: { value: pointerType },
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
    pressure: { value: pressure },
    buttons: { value: buttons },
    tiltX: { value: 2 },
    tiltY: { value: -1 },
  };
  if (timeStamp !== undefined) properties.timeStamp = { value: timeStamp };
  Object.defineProperties(event, properties);
  return event;
};

const ControlledInkCanvas = ({ onChange }: { onChange: jest.Mock }) => {
  const [document, setDocument] = useState<InkDocument>(emptyDocument);
  return (
    <InkCanvas
      document={document}
      onChange={(next) => {
        onChange(next);
        setDocument(next);
      }}
    />
  );
};

let context: {
  setTransform: jest.Mock;
  clearRect: jest.Mock;
  beginPath: jest.Mock;
  arc: jest.Mock;
  fill: jest.Mock;
  moveTo: jest.Mock;
  lineTo: jest.Mock;
  stroke: jest.Mock;
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
    context = {
      setTransform: jest.fn(),
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
    };
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
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

  it("records five reused-id Pencil strokes through controlled rerenders", () => {
    const onChange = jest.fn();
    render(<ControlledInkCanvas onChange={onChange} />);
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
    const setPointerCapture = jest.fn(() => {
      throw new DOMException("capture unavailable", "NotFoundError");
    });
    const releasePointerCapture = jest.fn(() => {
      throw new DOMException("capture unavailable", "NotFoundError");
    });
    Object.assign(canvas, {
      setPointerCapture,
      hasPointerCapture: jest.fn().mockReturnValue(true),
      releasePointerCapture,
    });

    for (let index = 0; index < 5; index += 1) {
      fireEvent(
        canvas,
        pointerEvent(
          "pointerdown",
          "pen",
          40 + index * 40,
          60,
          7,
          0.7,
          1,
          index * 10 + 1,
        ),
      );
      fireEvent(
        canvas,
        pointerEvent(
          "pointerup",
          "pen",
          60 + index * 40,
          80,
          7,
          0,
          0,
          index * 10 + 2,
        ),
      );
    }

    expect(onChange).toHaveBeenCalledTimes(5);
    expect(onChange.mock.calls[4][0].strokes).toHaveLength(5);
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(releasePointerCapture).not.toHaveBeenCalled();
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
    fireEvent(canvas, pointerEvent("pointercancel", "pen", 80, 90, 9));
    fireEvent(canvas, pointerEvent("pointerup", "pen", 80, 90, 9));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].strokes).toHaveLength(1);
  });

  it("finishes a Pencil stroke when pointerup occurs outside the canvas", () => {
    const onChange = jest.fn();
    render(<InkCanvas document={emptyDocument} onChange={onChange} />);
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");

    fireEvent(canvas, pointerEvent("pointerdown", "pen", 40, 60, 5));
    fireEvent(window, pointerEvent("pointermove", "pen", 80, 90, 5));
    fireEvent(window, pointerEvent("pointerup", "pen", 80, 90, 5));
    fireEvent(canvas, pointerEvent("pointerdown", "pen", 120, 130, 5));
    fireEvent(window, pointerEvent("pointerup", "pen", 160, 170, 5));

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0].strokes).toHaveLength(2);
    expect(onChange.mock.calls[0][0].strokes[0].points).toHaveLength(2);
  });

  it("ignores a zero-pressure move and continues the current stroke", () => {
    const onChange = jest.fn();
    render(<InkCanvas document={emptyDocument} onChange={onChange} />);
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");

    fireEvent(
      canvas,
      pointerEvent("pointerdown", "pen", 40, 60, 6, 0.7, 1, 10),
    );
    fireEvent(
      canvas,
      pointerEvent("pointermove", "pen", 80, 90, 6, 0, 0, 11),
    );
    fireEvent(
      canvas,
      pointerEvent("pointermove", "pen", 120, 130, 6, 0.8, 1, 12),
    );
    fireEvent(
      window,
      pointerEvent("pointerup", "pen", 120, 130, 6, 0, 0, 13),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].strokes[0].points).toHaveLength(2);
    expect(onChange.mock.calls[0][0].strokes[0].points[1][0]).toBe(0.3);
  });

  it("ignores delayed events from a previous reused pointerId stroke", () => {
    const onChange = jest.fn();
    render(<InkCanvas document={emptyDocument} onChange={onChange} />);
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");

    fireEvent(
      canvas,
      pointerEvent("pointerdown", "pen", 40, 60, 7, 0.7, 1, 100),
    );
    fireEvent(
      canvas,
      pointerEvent("pointermove", "pen", 80, 90, 7, 0.7, 1, 110),
    );
    fireEvent(
      canvas,
      pointerEvent("pointerdown", "pen", 120, 130, 7, 0.7, 1, 200),
    );
    expect(onChange).toHaveBeenCalledTimes(1);

    fireEvent(
      window,
      pointerEvent("pointermove", "pen", 90, 100, 7, 0, 0, 120),
    );
    fireEvent(
      window,
      pointerEvent("pointerup", "pen", 90, 100, 7, 0, 0, 130),
    );
    fireEvent(
      window,
      pointerEvent("pointercancel", "pen", 90, 100, 7, 0, 0, 140),
    );
    fireEvent(
      window,
      pointerEvent("pointerup", "mouse", 90, 100, 7, 0, 0, 205),
    );
    expect(onChange).toHaveBeenCalledTimes(1);

    fireEvent(
      window,
      pointerEvent("pointermove", "pen", 160, 170, 7, 0.8, 1, 210),
    );
    fireEvent(
      window,
      pointerEvent("pointerup", "pen", 160, 170, 7, 0, 0, 220),
    );

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0].strokes).toHaveLength(2);
    expect(onChange.mock.calls[1][0].strokes[1].points).toHaveLength(2);
  });

  it("registers stable global Pencil listeners once across rerenders", () => {
    const addEventListener = jest.spyOn(window, "addEventListener");
    const removeEventListener = jest.spyOn(window, "removeEventListener");
    const { rerender, unmount } = render(
      <InkCanvas document={emptyDocument} onChange={jest.fn()} />,
    );

    for (let index = 0; index < 5; index += 1) {
      rerender(
        <InkCanvas
          document={{ ...emptyDocument, strokes: [] }}
          onChange={jest.fn()}
        />,
      );
    }

    const pointerAdds = addEventListener.mock.calls.filter(([type]) =>
      ["pointermove", "pointerup", "pointercancel"].includes(type),
    );
    expect(pointerAdds.map(([type]) => type)).toEqual([
      "pointermove",
      "pointerup",
      "pointercancel",
    ]);

    unmount();
    const pointerRemoves = removeEventListener.mock.calls.filter(([type]) =>
      ["pointermove", "pointerup", "pointercancel"].includes(type),
    );
    expect(pointerRemoves).toHaveLength(3);
    pointerAdds.forEach(([type, listener]) => {
      expect(pointerRemoves).toContainEqual([type, listener]);
    });
  });

  it("redraws an active Pencil stroke during a parent rerender", () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <InkCanvas document={emptyDocument} onChange={onChange} />,
    );
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");

    fireEvent(canvas, pointerEvent("pointerdown", "pen", 40, 60, 4));
    fireEvent(canvas, pointerEvent("pointermove", "pen", 80, 90, 4));
    context.stroke.mockClear();

    rerender(
      <InkCanvas
        document={{ ...emptyDocument, strokes: [] }}
        onChange={onChange}
      />,
    );

    expect(context.clearRect).toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalled();
    fireEvent(window, pointerEvent("pointerup", "pen", 80, 90, 4));
    expect(onChange).toHaveBeenCalledTimes(1);
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
    fireEvent(viewport, pointerEvent("pointerup", "touch", 210, 10, 12));
    expect(viewport.releasePointerCapture).not.toHaveBeenCalled();
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
