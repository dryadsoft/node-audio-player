import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** User-opened details never resize the writing surface or steal Pencil focus. */
export default function StatusDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<div className="note-status-overlay" onClick={e => { if (e.target === e.currentTarget) closeRef.current(); }}>
    <div ref={ref} className="note-status-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={e => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); }
      if (e.key !== "Tab") return;
      const controls = Array.from(ref.current!.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
    }}>
      <div className="note-status-heading"><h2>{title}</h2><button type="button" className="button secondary" onClick={close}>닫기</button></div>
      {children}
    </div>
  </div>, document.body);
}
