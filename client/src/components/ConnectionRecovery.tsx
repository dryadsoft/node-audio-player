import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "react-query";
import { checkConnection, connection } from "../api/connection";
import { useAttendance } from "../attendance/workspace";
import { useNoteWorkspace } from "../offline/useNoteWorkspace";
import { updateBlockReason } from "../offline/updateGuard";
import {
  beginAuthRecovery,
  clearAuthAttempt,
  hasAuthAttempt,
  registerReauthentication,
} from "../offline/authRecovery";

export default function ConnectionRecovery() {
  const notes = useNoteWorkspace();
  const attendance = useAttendance();
  const queries = useQueryClient();
  const [state, setState] = useState(connection.getSnapshot);
  const [resume, setResume] = useState(0);
  const [reason, setReason] = useState("");
  const [navigating, setNavigating] = useState(false);
  const deferred = useRef(-1);
  const tried = useRef(-1);
  const latest = useRef({ notes, attendance });
  latest.current = { notes, attendance };

  const safety = useCallback(() => {
    const { notes: n, attendance: a } = latest.current;
    if (document.hidden) return "앱을 다시 열고 로그인을 확인해 주세요.";
    if (!n.hydrated || !a.hydrated) return "기기 기록을 확인하고 있습니다.";
    if (
      !n.workspace.canNavigate() ||
      a.unsaved ||
      n.storageError ||
      a.storageError
    )
      return "기기에 저장되지 않은 입력이 있습니다. 저장하거나 기록을 내보낸 뒤 다시 로그인해 주세요.";
    if (connection.writes() || queries.isMutating() || n.saving.length)
      return "저장 작업이 끝난 뒤 다시 로그인해 주세요.";
    if (updateBlockReason())
      return "진행 중인 입력이나 재생을 마치고 다시 로그인해 주세요.";
    if (
      document.activeElement?.matches("input, textarea, [contenteditable=true]")
    )
      return "입력을 마친 뒤 다시 로그인해 주세요.";
    return "";
  }, [queries]);
  const login = useRef(() => {});
  login.current = () => {
    const blocked = safety();
    setReason(blocked);
    if (blocked || navigating) return;
    setNavigating(beginAuthRecovery(true));
  };

  useEffect(() => {
    const stop = connection.start();
    const unsubscribe = connection.subscribe(() =>
      setState(connection.getSnapshot())
    );
    setState(connection.getSnapshot());
    const wake = () => {
      if (!document.hidden) {
        setResume((n) => n + 1);
        void checkConnection();
      }
    };
    const networkChanged = () => {
      if (!document.hidden) void checkConnection(true);
    };
    const unregister = registerReauthentication(() => login.current());
    window.addEventListener("online", networkChanged);
    window.addEventListener("offline", networkChanged);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      stop();
      unsubscribe();
      unregister();
      window.removeEventListener("online", networkChanged);
      window.removeEventListener("offline", networkChanged);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  useEffect(() => {
    if (state.phase !== "ready") return;
    clearAuthAttempt();
    setReason("");
    void queries.invalidateQueries();
    void latest.current.notes.workspace.refresh(true);
    void latest.current.attendance.workspace.refresh();
  }, [state, queries]);

  useEffect(() => {
    if (state.phase !== "auth" || navigating || document.hidden) return;
    if (!notes.hydrated || !attendance.hydrated) return;
    if (deferred.current === state.episode || tried.current === state.episode)
      return;
    const blocked = safety();
    if (blocked || hasAuthAttempt()) {
      deferred.current = state.episode;
      setReason(
        blocked || "자동 재연결을 완료하지 못했습니다. 다시 로그인해 주세요."
      );
      return;
    }
    tried.current = state.episode;
    // Give React a frame to show the explanation and recheck all live guards.
    const timer = window.setTimeout(() => {
      const next = safety();
      if (next) {
        deferred.current = state.episode;
        setReason(next);
        return;
      }
      if (beginAuthRecovery(false)) setNavigating(true);
      else {
        deferred.current = state.episode;
        setReason("다시 로그인 버튼으로 연결해 주세요.");
      }
    }, 150);
    return () => {
      window.clearTimeout(timer);
      tried.current = -1;
    };
  }, [
    state.phase,
    state.episode,
    navigating,
    notes.hydrated,
    attendance.hydrated,
    safety,
    resume,
  ]);

  if (
    (state.phase === "ready" || state.phase === "checking") &&
    !reason &&
    !navigating
  )
    return null;
  return (
    <aside className="connection-recovery" aria-label="연결 상태">
      <span role="status">
        {state.phase === "auth" || navigating
          ? navigating
            ? "로그인을 다시 확인하고 있습니다…"
            : "로그인을 다시 확인해야 합니다. 기기에 저장된 기록은 유지됩니다."
          : state.message || "연결을 다시 확인합니다."}
      </span>
      {reason && <span role="alert">{reason}</span>}
      <div>
        {(state.phase === "auth" || !!reason) && (
          <button
            type="button"
            className="button accent"
            disabled={navigating}
            onClick={() => login.current()}
          >
            다시 로그인
          </button>
        )}
        <button
          type="button"
          className="button secondary"
          disabled={navigating}
          onClick={() => {
            void checkConnection(true);
          }}
        >
          연결 다시 확인
        </button>
      </div>
    </aside>
  );
}
