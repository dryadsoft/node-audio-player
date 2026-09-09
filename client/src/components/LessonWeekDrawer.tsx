import { RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiArrowLeft, FiCheck, FiX } from "react-icons/fi";
import { useLocalCurriculum } from "../offline/useNoteWorkspace";
import { LessonCurriculumSummary, LessonTerm } from "../types";

const TERM_LABELS: Record<LessonTerm, string> = {
  spring: "봄학기",
  summer: "여름학기",
  fall: "가을학기",
  winter: "겨울학기",
};

interface LessonWeekDrawerProps {
  initialCurriculumId: string;
  curricula: LessonCurriculumSummary[];
  selectedId: string;
  selectedWeek: number;
  anchorRef: RefObject<HTMLElement>;
  onClose: () => void;
  onSelect: (curriculumId: string, week: number) => void;
}

function LessonWeekDrawer({
  initialCurriculumId,
  curricula,
  selectedId,
  selectedWeek,
  anchorRef,
  onClose,
  onSelect,
}: LessonWeekDrawerProps) {
  const [curriculumId, setCurriculumId] = useState(initialCurriculumId);
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocus = useRef(true);
  const releaseDialog = useRef<() => void>(() => {});
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timer = useRef<number>();
  const finish = useRef<(() => void)>();
  const close = (action = onClose) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { releaseDialog.current(); action(); return; }
    finish.current = () => { window.clearTimeout(timer.current); finish.current = undefined; releaseDialog.current(); action(); };
    setClosing(true);
    timer.current = window.setTimeout(() => finish.current?.(), 220);
  };
  closeRef.current = () => close();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const curriculum = curricula.find((item) => item.id === curriculumId);
  const detailQuery = useLocalCurriculum(curriculumId);
  const detail = detailQuery.data?.id === curriculumId ? detailQuery.data : undefined;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const position = () => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const rect = anchorRef.current?.getBoundingClientRect();
      const desktop = window.innerWidth > 900 && rect;
      dialog.style.left = `${desktop ? Math.min(rect.right + 8, window.innerWidth - 292) : 8}px`;
      dialog.style.top = `${desktop ? Math.max(12, Math.min(rect.top, window.innerHeight - 240)) : 8}px`;
      dialog.style.bottom = desktop ? "12px" : "8px";
    };
    const focusableElements = () =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex="0"]',
      ) || []).filter((element) => !element.hidden && getComputedStyle(element).display !== "none");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === "Tab") {
        const elements = focusableElements();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (!dialogRef.current?.contains(event.target as Node)) {
        focusableElements()[0]?.focus();
      }
    };
    position();
    window.addEventListener("resize", position);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", containFocus);
    let released = false;
    releaseDialog.current = () => {
      if (released) return;
      released = true;
      window.removeEventListener("resize", position);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", containFocus);
      document.body.style.overflow = previousOverflow;
      if (restoreFocus.current && opener?.isConnected) opener.focus({ preventScroll: true });
    };
    return () => releaseDialog.current();
  }, [anchorRef]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const current = dialog?.querySelector<HTMLElement>('[aria-current="true"]');
    const target = current || dialog?.querySelector<HTMLElement>(".lesson-drawer-list button") ||
      dialog?.querySelector<HTMLElement>("button");
    target?.focus({ preventScroll: true });
    current?.scrollIntoView?.({ block: "nearest" });
  }, [curriculumId, detail?.id, detailQuery.isError]);

  return createPortal(
    <div className={`lesson-drawer-backdrop ${closing ? "closing" : ""}`} onClick={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section
        id="lesson-week-drawer"
        className="lesson-week-drawer"
        onAnimationEnd={(event) => { if (closing && event.target === event.currentTarget) finish.current?.(); }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-drawer-title"
        ref={dialogRef}
      >
        <header className="lesson-drawer-heading">
          <div>
            <h2 id="lesson-drawer-title">
              {curriculum ? (curriculum.year ? `${curriculum.year}년 ${TERM_LABELS[curriculum.term]}` : "복구 기록") : "학기 선택"}
            </h2>
            {curriculum ? <p>{curriculum.programName}</p> : null}
          </div>
          <button className="button icon-button" type="button" aria-label="주차 메뉴 닫기" onClick={() => close()}>
            <FiX aria-hidden="true" />
          </button>
        </header>
        {curriculumId ? (
          <button className="lesson-drawer-back" type="button" onClick={() => setCurriculumId("")}>
            <FiArrowLeft aria-hidden="true" /> 학기 목록으로
          </button>
        ) : null}
        <nav className="lesson-drawer-list" aria-label={curriculumId ? "주차 선택" : "학기 선택"} key={curriculumId}>
          {!curriculumId ? (
            curricula.length ? curricula.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-current={item.id === selectedId ? "true" : undefined}
                onClick={() => setCurriculumId(item.id)}
              >
                <b>{item.year ? `${item.year}년 ${TERM_LABELS[item.term]}` : "복구 기록"}</b>
                <span className="lesson-drawer-label">{item.programName}</span>
              </button>
            )) : <p className="lesson-drawer-state">공통 원본이 없습니다. 새 공통 원본으로 시작하세요.</p>
          ) : !detail && detailQuery.isError ? (
            <div className="lesson-drawer-state" role="alert">
              <p>주차 목록을 불러오지 못했습니다.</p>
              <button className="button secondary" type="button" onClick={() => detailQuery.refetch()}>다시 시도</button>
            </div>
          ) : !detail ? (
            <p className="lesson-drawer-state" role="status">주차 목록을 불러오는 중...</p>
          ) : detail.weeks.map((week) => {
            const available = detailQuery.availableWeeks.includes(week.week);
            const filled = Boolean(week.hasInk || week.className || week.content);
            return (
              <button
                type="button"
                key={week.week}
                aria-label={`${week.week}주차${week.className ? ` · ${week.className}` : ""}${filled ? ", 작성 내용 있음" : ""}`}
                aria-current={curriculumId === selectedId && week.week === selectedWeek ? "true" : undefined}
                onClick={() => {
                  restoreFocus.current = false;
                  close(() => onSelect(curriculumId, week.week));
                }}
              >
                <b>{week.week}주차</b>
                {week.className ? <span className="lesson-drawer-label">{week.className}</span> : null}
                {!available ? <small>기기에 없음</small> : null}
                {filled ? <FiCheck className="lesson-drawer-filled" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </nav>
      </section>
    </div>,
    document.body,
  );
}

export default LessonWeekDrawer;
