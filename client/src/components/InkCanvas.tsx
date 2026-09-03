import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  FiEdit3,
  FiRotateCcw,
  FiRotateCw,
  FiTrash2,
} from "react-icons/fi";
import { InkDocumentV1, InkPoint, InkStroke } from "../types";

interface InkCanvasProps {
  document: InkDocumentV1;
  onChange: (document: InkDocumentV1) => void;
}

type Tool = "pen" | "eraser";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const strokeId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function InkCanvas({ document, onChange }: InkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<InkStroke>();
  const history = useRef<InkDocumentV1[]>([]);
  const future = useRef<InkDocumentV1[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<InkStroke["color"]>("#111827");
  const [width, setWidth] = useState<InkStroke["width"]>(4);

  const drawStroke = useCallback(
    (
      context: CanvasRenderingContext2D,
      canvas: HTMLCanvasElement,
      stroke: InkStroke,
    ) => {
      const points = stroke.points;
      if (!points.length) return;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = stroke.color;
      context.fillStyle = stroke.color;
      if (points.length === 1) {
        const pressure = points[0][2] || 0.5;
        const radius = (stroke.width * (0.55 + pressure * 0.65)) / 2;
        context.beginPath();
        context.arc(
          points[0][0] * canvas.clientWidth,
          points[0][1] * canvas.clientHeight,
          radius,
          0,
          Math.PI * 2,
        );
        context.fill();
        return;
      }
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const point = points[index];
        const pressure = (previous[2] + point[2]) / 2 || 0.5;
        context.lineWidth = stroke.width * (0.55 + pressure * 0.65);
        context.beginPath();
        context.moveTo(
          previous[0] * canvas.clientWidth,
          previous[1] * canvas.clientHeight,
        );
        context.lineTo(
          point[0] * canvas.clientWidth,
          point[1] * canvas.clientHeight,
        );
        context.stroke();
      }
    },
    [],
  );

  const redraw = useCallback(
    (ink: InkDocumentV1 = document) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const bitmapWidth = Math.max(1, Math.round(rect.width * ratio));
      const bitmapHeight = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
        canvas.width = bitmapWidth;
        canvas.height = bitmapHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      ink.strokes.forEach((stroke) => drawStroke(context, canvas, stroke));
    },
    [document, drawStroke],
  );

  useEffect(() => {
    redraw();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const commit = (next: InkDocumentV1) => {
    history.current = [...history.current.slice(-49), document];
    future.current = [];
    onChange(next);
    window.requestAnimationFrame(() => redraw(next));
  };

  const pointFromEvent = (
    event: PointerEvent,
    canvas: HTMLCanvasElement,
  ): InkPoint => {
    const rect = canvas.getBoundingClientRect();
    return [
      clamp((event.clientX - rect.left) / rect.width),
      clamp((event.clientY - rect.top) / rect.height),
      clamp(event.pressure || 0.5),
      Math.max(0, Math.round(event.timeStamp)),
      event.tiltX,
      event.tiltY,
    ];
  };

  const acceptedPointer = (event: ReactPointerEvent<HTMLCanvasElement>) =>
    event.pointerType === "pen" || event.pointerType === "mouse";

  const eraseAt = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const reversedIndex = [...document.strokes]
      .reverse()
      .findIndex((stroke) =>
        stroke.points.some(
          (point) =>
            Math.hypot(
              point[0] * rect.width - x,
              point[1] * rect.height - y,
            ) <= Math.max(12, stroke.width * 2),
        ),
      );
    if (reversedIndex < 0) return;
    const index = document.strokes.length - 1 - reversedIndex;
    commit({
      ...document,
      strokes: document.strokes.filter((_, itemIndex) => itemIndex !== index),
    });
  };

  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!acceptedPointer(event)) return;
    event.preventDefault();
    if (tool === "eraser") {
      eraseAt(event);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    activeStroke.current = {
      id: strokeId(),
      color,
      width,
      points: [pointFromEvent(event.nativeEvent, event.currentTarget)],
    };
    const context = event.currentTarget.getContext("2d");
    if (context) drawStroke(context, event.currentTarget, activeStroke.current);
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!activeStroke.current || !acceptedPointer(event)) return;
    event.preventDefault();
    const nativeEvent = event.nativeEvent;
    const coalesced =
      typeof nativeEvent.getCoalescedEvents === "function"
        ? nativeEvent.getCoalescedEvents()
        : [];
    const samples = coalesced.length ? coalesced : [nativeEvent];
    const nextPoints = samples.map((sample) =>
      pointFromEvent(sample, event.currentTarget),
    );
    const previous = activeStroke.current.points.slice(-1);
    activeStroke.current = {
      ...activeStroke.current,
      points: [...activeStroke.current.points, ...nextPoints],
    };
    const context = event.currentTarget.getContext("2d");
    if (context) {
      drawStroke(context, event.currentTarget, {
        ...activeStroke.current,
        points: [...previous, ...nextPoints],
      });
    }
  };

  const finish = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!activeStroke.current || !acceptedPointer(event)) return;
    const stroke = activeStroke.current;
    activeStroke.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commit({ ...document, strokes: [...document.strokes, stroke] });
  };

  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(document);
    onChange(previous);
  };

  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(document);
    onChange(next);
  };

  const clear = () => {
    if (!document.strokes.length) return;
    if (window.confirm("이 주차의 필기를 모두 지울까요?")) {
      commit({ ...document, strokes: [] });
    }
  };

  return (
    <section className="ink-editor" aria-label="Pencil 자유 필기">
      <div className="ink-toolbar">
        <div className="ink-tool-group" aria-label="필기 도구">
          <button
            type="button"
            className={tool === "pen" ? "active" : ""}
            aria-pressed={tool === "pen"}
            onClick={() => setTool("pen")}
          >
            <FiEdit3 /> 펜
          </button>
          <button
            type="button"
            className={tool === "eraser" ? "active" : ""}
            aria-pressed={tool === "eraser"}
            onClick={() => setTool("eraser")}
          >
            지우개
          </button>
        </div>
        <div className="ink-tool-group" aria-label="펜 색상">
          {(["#111827", "#1d4ed8", "#dc2626"] as const).map((item) => (
            <button
              type="button"
              key={item}
              className={`ink-color ${color === item ? "active" : ""}`}
              style={{ color: item }}
              aria-label={`${item} 펜 색상`}
              aria-pressed={color === item}
              onClick={() => {
                setColor(item);
                setTool("pen");
              }}
            />
          ))}
        </div>
        <div className="ink-tool-group" aria-label="펜 굵기">
          {([2, 4, 7] as const).map((item) => (
            <button
              type="button"
              key={item}
              className={width === item ? "active" : ""}
              aria-label={`펜 굵기 ${item}`}
              aria-pressed={width === item}
              onClick={() => setWidth(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="ink-tool-group ink-history-tools">
          <button type="button" aria-label="필기 실행 취소" onClick={undo}>
            <FiRotateCcw />
          </button>
          <button type="button" aria-label="필기 다시 실행" onClick={redo}>
            <FiRotateCw />
          </button>
          <button type="button" aria-label="필기 전체 지우기" onClick={clear}>
            <FiTrash2 />
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="ink-canvas"
        style={{ aspectRatio: String(document.aspectRatio) }}
        aria-label="Apple Pencil 필기 영역"
        tabIndex={0}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <p className="ink-help">Apple Pencil로 필기하세요. 손가락은 화면 조작에만 사용됩니다.</p>
    </section>
  );
}

export default InkCanvas;
