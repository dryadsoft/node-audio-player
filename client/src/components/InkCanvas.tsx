import {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FiEdit3,
  FiMaximize2,
  FiMinimize2,
  FiRotateCcw,
  FiRotateCw,
  FiTrash2,
} from "react-icons/fi";
import {
  InkDocument,
  InkDocumentV2,
  InkPoint,
  InkStrokeV2,
} from "../types";

interface InkCanvasProps {
  document: InkDocument;
  onChange: (document: InkDocumentV2) => void;
}

type Tool = "pen" | "eraser";
type TouchPoint = { x: number; y: number };
type ActiveStroke = {
  pointerId: number;
  pointerType: string;
  contactEnded: boolean;
  page: number;
  canvas: HTMLCanvasElement;
  stroke: InkStrokeV2;
};

type PendingFinish = {
  frameId: number;
  stroke: ActiveStroke;
};

const DEFAULT_PAGE_COUNT = 2;
const MAX_PAGE_COUNT = 20;
const PAGE_ADD_THRESHOLD = 0.85;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const MAX_PAGES_WIDTH = 980;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const clampZoom = (value: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

const strokeId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const normalizeDocument = (document: InkDocument): InkDocumentV2 => {
  if (document.version === 2) {
    return {
      ...document,
      pageCount: Math.min(
        MAX_PAGE_COUNT,
        Math.max(DEFAULT_PAGE_COUNT, Math.floor(document.pageCount)),
      ),
      strokes: document.strokes.map((stroke) => ({ ...stroke })),
    };
  }
  return {
    version: 2,
    aspectRatio: document.aspectRatio,
    pageCount: DEFAULT_PAGE_COUNT,
    strokes: document.strokes.map((stroke) => ({ ...stroke, page: 0 })),
  };
};

const touchDistance = (points: TouchPoint[]) =>
  Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

function InkCanvas({ document: sourceDocument, onChange }: InkCanvasProps) {
  const ink = useMemo(
    () => normalizeDocument(sourceDocument),
    [sourceDocument],
  );
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>());
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomStageRef = useRef<HTMLDivElement>(null);
  const pagesLayerRef = useRef<HTMLDivElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const documentRef = useRef(ink);
  const onChangeRef = useRef(onChange);
  const activeStroke = useRef<ActiveStroke>();
  const pendingFinish = useRef<PendingFinish>();
  const moveActiveStrokeRef = useRef<(event: PointerEvent) => void>(() => {});
  const finishActiveStrokeRef = useRef<(event: PointerEvent) => void>(
    () => {},
  );
  const touchPointers = useRef(new Map<number, TouchPoint>());
  const pinchDistance = useRef<number>();
  const history = useRef<InkDocumentV2[]>([]);
  const future = useRef<InkDocumentV2[]>([]);
  const zoomRef = useRef(1);
  const zoomFocus = useRef<{
    localX: number;
    localY: number;
    clientX: number;
    clientY: number;
  }>();
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<InkStrokeV2["color"]>("#111827");
  const [width, setWidth] = useState<InkStrokeV2["width"]>(4);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [pagesWidth, setPagesWidth] = useState(MAX_PAGES_WIDTH);
  const [pagesHeight, setPagesHeight] = useState(0);

  onChangeRef.current = onChange;

  const drawStroke = useCallback(
    (
      context: CanvasRenderingContext2D,
      canvas: HTMLCanvasElement,
      stroke: InkStrokeV2,
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

  const redrawPage = useCallback(
    (page: number, nextInk: InkDocumentV2, nextZoom: number) => {
      const canvas = canvasRefs.current.get(page);
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const ratio = (window.devicePixelRatio || 1) * nextZoom;
      const bitmapWidth = Math.max(1, Math.round(width * ratio));
      const bitmapHeight = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
        canvas.width = bitmapWidth;
        canvas.height = bitmapHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      nextInk.strokes.forEach((stroke) => {
        if (stroke.page === page) drawStroke(context, canvas, stroke);
      });
      const active = activeStroke.current;
      if (active?.page === page) drawStroke(context, canvas, active.stroke);
    },
    [drawStroke],
  );

  const redrawAll = useCallback(
    (nextInk: InkDocumentV2, nextZoom: number) => {
      for (let page = 0; page < nextInk.pageCount; page += 1) {
        redrawPage(page, nextInk, nextZoom);
      }
    },
    [redrawPage],
  );

  useEffect(() => {
    documentRef.current = ink;
    redrawAll(ink, zoomRef.current);
    const canvases = Array.from(canvasRefs.current.values());
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      redrawAll(documentRef.current, zoomRef.current),
    );
    canvases.forEach((canvas) => observer.observe(canvas));
    return () => observer.disconnect();
  }, [ink, ink.pageCount, redrawAll]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const nextWidth = Math.min(MAX_PAGES_WIDTH, viewport.clientWidth);
      if (nextWidth <= 0) return;
      setPagesWidth((current) =>
        current === nextWidth ? current : nextWidth,
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const pagesLayer = pagesLayerRef.current;
    if (!pagesLayer) return;
    const measure = () => {
      const nextHeight = pagesLayer.offsetHeight;
      setPagesHeight((current) =>
        current === nextHeight ? current : nextHeight,
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(pagesLayer);
    return () => observer.disconnect();
  }, [ink.pageCount, pagesWidth]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const preventSelection = (event: Event) => event.preventDefault();
    viewport.addEventListener("selectstart", preventSelection);
    return () => viewport.removeEventListener("selectstart", preventSelection);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const preventCancelableTouchMove = (event: TouchEvent) => {
      // WebKit Scribble can omit Pencil events unless native touch scrolling is blocked.
      if (event.cancelable) event.preventDefault();
    };
    viewport.addEventListener("touchmove", preventCancelableTouchMove, {
      passive: false,
    });
    return () =>
      viewport.removeEventListener("touchmove", preventCancelableTouchMove);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    document.body.classList.add("ink-fullscreen-open");
    document.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => fullscreenButtonRef.current?.focus());
    return () => {
      document.body.classList.remove("ink-fullscreen-open");
      document.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [fullscreen]);

  useEffect(
    () => () => document.body.classList.remove("ink-fullscreen-open"),
    [],
  );

  const commit = useCallback(
    (next: InkDocumentV2) => {
      history.current = [...history.current.slice(-49), documentRef.current];
      future.current = [];
      documentRef.current = next;
      onChangeRef.current(next);
      window.requestAnimationFrame(() => redrawAll(next, zoomRef.current));
    },
    [redrawAll],
  );

  const pointFromEvent = useCallback(
    (event: PointerEvent, canvas: HTMLCanvasElement): InkPoint => {
      const rect = canvas.getBoundingClientRect();
      return [
        clamp((event.clientX - rect.left) / rect.width),
        clamp((event.clientY - rect.top) / rect.height),
        clamp(event.pressure || 0.5),
        Math.max(0, Math.round(event.timeStamp)),
        event.tiltX,
        event.tiltY,
      ];
    },
    [],
  );

  const clearTouchPointers = () => {
    touchPointers.current.clear();
    pinchDistance.current = undefined;
  };

  const eraseAt = (
    event: PointerEvent,
    page: number,
    canvas: HTMLCanvasElement,
  ) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const current = documentRef.current;
    const reversedIndex = [...current.strokes]
      .reverse()
      .findIndex(
        (stroke) =>
          stroke.page === page &&
          stroke.points.some(
            (point) =>
              Math.hypot(
                point[0] * rect.width - x,
                point[1] * rect.height - y,
              ) <= Math.max(12, stroke.width * 2 * zoomRef.current),
          ),
      );
    if (reversedIndex < 0) return;
    const index = current.strokes.length - 1 - reversedIndex;
    commit({
      ...current,
      strokes: current.strokes.filter((_, itemIndex) => itemIndex !== index),
    });
  };

  const cancelPendingFinish = useCallback(() => {
    const pending = pendingFinish.current;
    if (!pending) return;
    window.cancelAnimationFrame(pending.frameId);
    pendingFinish.current = undefined;
  }, []);

  const finalizeActiveStroke = useCallback((expected?: ActiveStroke) => {
    const active = activeStroke.current;
    if (!active || (expected && active !== expected)) return;
    if (pendingFinish.current?.stroke === active) cancelPendingFinish();
    activeStroke.current = undefined;
    const current = documentRef.current;
    const shouldAddPage =
      active.page === current.pageCount - 1 &&
      current.pageCount < MAX_PAGE_COUNT &&
      active.stroke.points.some((point) => point[1] >= PAGE_ADD_THRESHOLD);
    commit({
      ...current,
      pageCount: shouldAddPage ? current.pageCount + 1 : current.pageCount,
      strokes: [...current.strokes, active.stroke],
    });
  }, [cancelPendingFinish, commit]);

  const beginStroke = useCallback(
    (
      event: PointerEvent,
      page: number,
      canvas: HTMLCanvasElement,
      appearance?: Pick<InkStrokeV2, "color" | "width">,
      samples: PointerEvent[] = [event],
    ) => {
      const stroke: InkStrokeV2 = {
        id: strokeId(),
        page,
        color: appearance?.color ?? color,
        width: appearance?.width ?? width,
        points: samples.map((sample) => pointFromEvent(sample, canvas)),
      };
      activeStroke.current = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        contactEnded: false,
        page,
        canvas,
        stroke,
      };
      const context = canvas.getContext("2d");
      if (context) drawStroke(context, canvas, stroke);
    },
    [color, drawStroke, pointFromEvent, width],
  );

  const startStroke = (event: PointerEvent, page: number) => {
    if (event.pointerType !== "pen" && event.pointerType !== "mouse") return;
    event.preventDefault();
    const canvas = event.target;
    if (!(canvas instanceof HTMLCanvasElement)) return;
    if (event.pointerType === "pen") {
      try {
        canvas.releasePointerCapture?.(event.pointerId);
      } catch {
        // WebKit may throw when implicit capture is not active yet.
      }
    }
    cancelPendingFinish();
    if (activeStroke.current) finalizeActiveStroke(activeStroke.current);
    clearTouchPointers();
    if (tool === "eraser") {
      eraseAt(event, page, canvas);
      return;
    }
    beginStroke(event, page, canvas);
  };

  const moveActiveStroke = useCallback((event: PointerEvent) => {
    const active = activeStroke.current;
    if (
      (event.pointerType !== "pen" && event.pointerType !== "mouse") ||
      !active ||
      active.pointerId !== event.pointerId ||
      active.pointerType !== event.pointerType
    ) {
      return;
    }
    event.preventDefault();
    if (event.pressure === 0 && event.buttons === 0) {
      active.contactEnded = true;
      return;
    }
    const coalesced =
      typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : [];
    const samples = (coalesced.length ? coalesced : [event]).filter(
      (sample) =>
        sample.pointerId === active.pointerId &&
        sample.pointerType === active.pointerType &&
        (sample.pressure !== 0 || sample.buttons !== 0),
    );
    if (!samples.length) return;
    cancelPendingFinish();
    if (active.contactEnded) {
      const { page, canvas } = active;
      const appearance = {
        color: active.stroke.color,
        width: active.stroke.width,
      };
      finalizeActiveStroke(active);
      beginStroke(event, page, canvas, appearance, samples);
      return;
    }
    const nextPoints = samples.map((sample) =>
      pointFromEvent(sample, active.canvas),
    );
    const previous = active.stroke.points.slice(-1);
    active.stroke = {
      ...active.stroke,
      points: [...active.stroke.points, ...nextPoints],
    };
    const context = active.canvas.getContext("2d");
    if (context) {
      drawStroke(context, active.canvas, {
        ...active.stroke,
        points: [...previous, ...nextPoints],
      });
    }
  }, [
    beginStroke,
    cancelPendingFinish,
    drawStroke,
    finalizeActiveStroke,
    pointFromEvent,
  ]);

  moveActiveStrokeRef.current = moveActiveStroke;
  finishActiveStrokeRef.current = (event: PointerEvent) => {
    if (event.pointerType !== "pen" && event.pointerType !== "mouse") return;
    const active = activeStroke.current;
    if (
      !active ||
      active.pointerId !== event.pointerId ||
      active.pointerType !== event.pointerType ||
      pendingFinish.current?.stroke === active
    ) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      if (pendingFinish.current?.frameId !== frameId) return;
      pendingFinish.current = undefined;
      finalizeActiveStroke(active);
    });
    pendingFinish.current = { frameId, stroke: active };
  };

  useEffect(() => {
    const moveActiveStroke = (event: PointerEvent) =>
      moveActiveStrokeRef.current(event);
    const finishActiveStroke = (event: PointerEvent) =>
      finishActiveStrokeRef.current(event);
    window.addEventListener("pointermove", moveActiveStroke, {
      passive: false,
    });
    window.addEventListener("pointerup", finishActiveStroke);
    window.addEventListener("pointercancel", finishActiveStroke);
    return () => {
      window.removeEventListener("pointermove", moveActiveStroke);
      window.removeEventListener("pointerup", finishActiveStroke);
      window.removeEventListener("pointercancel", finishActiveStroke);
      cancelPendingFinish();
    };
  }, [cancelPendingFinish]);

  const applyZoom = (nextValue: number, centerX: number, centerY: number) => {
    const viewport = viewportRef.current;
    const zoomStage = zoomStageRef.current;
    if (!viewport || !zoomStage) return;
    const previousZoom = zoomRef.current;
    const nextZoom = clampZoom(nextValue);
    if (Math.abs(previousZoom - nextZoom) < 0.005) return;
    const stageRect = zoomStage.getBoundingClientRect();
    zoomFocus.current = {
      localX: (centerX - stageRect.left) / previousZoom,
      localY: (centerY - stageRect.top) / previousZoom,
      clientX: centerX,
      clientY: centerY,
    };
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
  };

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const zoomStage = zoomStageRef.current;
    const focus = zoomFocus.current;
    if (viewport && zoomStage && focus) {
      const stageRect = zoomStage.getBoundingClientRect();
      viewport.scrollBy(
        stageRect.left + focus.localX * zoom - focus.clientX,
        stageRect.top + focus.localY * zoom - focus.clientY,
      );
      zoomFocus.current = undefined;
    }
    redrawAll(documentRef.current, zoom);
  }, [redrawAll, zoom]);

  const startTouch = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    event.preventDefault();
    if (activeStroke.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    touchPointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (touchPointers.current.size >= 2) {
      const points = Array.from(touchPointers.current.values()).slice(0, 2);
      pinchDistance.current = touchDistance(points);
    }
  };

  const moveTouch = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    event.preventDefault();
    if (activeStroke.current) return;
    const previous = touchPointers.current.get(event.pointerId);
    if (!previous) return;
    touchPointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const points = Array.from(touchPointers.current.values());
    if (points.length === 1) {
      event.currentTarget.scrollBy(
        previous.x - event.clientX,
        previous.y - event.clientY,
      );
      pinchDistance.current = undefined;
      return;
    }
    const pair = points.slice(0, 2);
    const distance = touchDistance(pair);
    const previousDistance = pinchDistance.current || distance;
    const centerX = (pair[0].x + pair[1].x) / 2;
    const centerY = (pair[0].y + pair[1].y) / 2;
    pinchDistance.current = distance;
    if (previousDistance > 0) {
      applyZoom(
        zoomRef.current * (distance / previousDistance),
        centerX,
        centerY,
      );
    }
  };

  const finishTouch = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    event.preventDefault();
    touchPointers.current.delete(event.pointerId);
    if (touchPointers.current.size < 2) pinchDistance.current = undefined;
  };

  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(documentRef.current);
    documentRef.current = previous;
    onChange(previous);
    window.requestAnimationFrame(() => redrawAll(previous, zoomRef.current));
  };

  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(documentRef.current);
    documentRef.current = next;
    onChange(next);
    window.requestAnimationFrame(() => redrawAll(next, zoomRef.current));
  };

  const clear = () => {
    if (!documentRef.current.strokes.length) return;
    if (window.confirm("이 주차의 필기를 모두 지울까요?")) {
      commit({
        ...documentRef.current,
        pageCount: DEFAULT_PAGE_COUNT,
        strokes: [],
      });
    }
  };

  const resetZoom = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    applyZoom(1, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const zoomStageStyle = {
    width: `${pagesWidth * zoom}px`,
    height: pagesHeight ? `${pagesHeight * zoom}px` : undefined,
  } as CSSProperties;

  const pagesStyle = {
    width: `${pagesWidth}px`,
    transform: `scale(${zoom})`,
  } as CSSProperties;

  return (
    <section
      className={`ink-editor ${fullscreen ? "ink-editor-fullscreen" : ""}`}
      aria-label="Pencil 자유 필기"
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen ? true : undefined}
    >
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
        <div className="ink-tool-group ink-view-tools" aria-label="필기 화면">
          <button
            type="button"
            aria-label="필기 확대 100%로 초기화"
            onClick={resetZoom}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            ref={fullscreenButtonRef}
            type="button"
            aria-label={fullscreen ? "필기 전체화면 닫기" : "필기 전체화면 열기"}
            aria-pressed={fullscreen}
            onClick={() => setFullscreen((current) => !current)}
          >
            {fullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
            {fullscreen ? "닫기" : "전체화면"}
          </button>
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
      <div
        ref={viewportRef}
        className="ink-scroll-viewport"
        onPointerDown={startTouch}
        onPointerMove={moveTouch}
        onPointerUp={finishTouch}
        onPointerCancel={finishTouch}
        onLostPointerCapture={finishTouch}
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
      >
        <div className="ink-scroll-content">
          <div
            ref={zoomStageRef}
            className="ink-zoom-stage"
            style={zoomStageStyle}
          >
            <div
              ref={pagesLayerRef}
              className="ink-pages-layer"
              style={pagesStyle}
            >
              {Array.from({ length: ink.pageCount }, (_, page) => (
                <div className="ink-page" key={page}>
                  <span className="ink-page-number">{page + 1}</span>
                  <canvas
                    ref={(canvas) => {
                      if (canvas) canvasRefs.current.set(page, canvas);
                      else canvasRefs.current.delete(page);
                    }}
                    className="ink-canvas"
                    style={{ aspectRatio: String(ink.aspectRatio) }}
                    aria-label={`Apple Pencil 필기 영역 ${page + 1}페이지`}
                    tabIndex={0}
                    onPointerDown={(event) =>
                      startStroke(event.nativeEvent, page)
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="ink-help">
        Pencil로 필기 · 한 손가락으로 이동 · 두 손가락으로 확대/축소 · 마지막 페이지 하단에 쓰면 새 페이지가 추가됩니다.
      </p>
    </section>
  );
}

export default InkCanvas;
