import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function ManagementDialog({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
  drawer = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  drawer?: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  const action = useRef({ onClose, busy });
  action.current = { onClose, busy };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled):not([hidden]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]'
        ) || []
      ).filter(
        (el) =>
          !el.closest("[hidden]") && getComputedStyle(el).display !== "none"
      );
    dialog.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!action.current.busy) action.current.onClose();
      }
      if (event.key === "Tab") {
        const items = controls(),
          first = items[0],
          last = items[items.length - 1];
        if (!first) {
          event.preventDefault();
          dialog.current?.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const contain = (event: FocusEvent) => {
      if (!dialog.current?.contains(event.target as Node))
        dialog.current?.focus();
    };
    document.addEventListener("keydown", key, true);
    document.addEventListener("focusin", contain);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("focusin", contain);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div
      className={`management-overlay ${
        drawer ? "management-drawer-overlay" : ""
      }`}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`management-dialog ${wide ? "management-wide" : ""} ${
          drawer ? "management-drawer" : ""
        }`}
      >
        <header className="management-heading">
          <h2>{title}</h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label={`${title} 닫기`}
          >
            닫기
          </button>
        </header>
        <div className="management-body">{children}</div>
      </section>
    </div>,
    document.body
  );
}
