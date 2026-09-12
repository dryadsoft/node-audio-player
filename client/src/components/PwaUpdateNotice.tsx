import { useEffect, useState } from "react";
import { useQueryClient } from "react-query";
import { useNoteWorkspace } from "../offline/useNoteWorkspace";
import { useAttendance } from "../attendance/workspace";
import {
  applyPwaUpdate,
  appBuildId,
  pwaState,
  subscribePwa,
} from "../offline/pwa";
import { updateBlockReason } from "../offline/updateGuard";

export default function PwaUpdateNotice() {
  const [state, setState] = useState(pwaState);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const notes = useNoteWorkspace();
  const attendance = useAttendance();
  const queryClient = useQueryClient();
  useEffect(() => subscribePwa(() => setState(pwaState())), []);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (updateBlockReason() || queryClient.isMutating()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [queryClient]);
  if (state !== "update") return null;
  const canApply = () => {
    const reason =
      updateBlockReason() ||
      (queryClient.isMutating() ? "작업을 마친 뒤 다시 적용해 주세요." : "") ||
      (!notes.workspace.canNavigate() ||
      attendance.workspace.getSnapshot().unsaved ||
      notes.workspace.getSnapshot().storageError ||
      attendance.workspace.getSnapshot().storageError
        ? "필기와 기기 저장을 마친 뒤 다시 적용해 주세요."
        : "");
    setError(reason);
    return !reason;
  };
  return (
    <aside className="pwa-update-notice" aria-label="앱 업데이트">
      <span role="status">새 버전이 준비됐습니다.</span>
      <button
        type="button"
        disabled={applying}
        onClick={async () => {
          if (!canApply()) return;
          setApplying(true);
          try {
            if (!(await applyPwaUpdate(canApply)))
              setError(
                (current) =>
                  current ||
                  "업데이트를 적용하지 못했습니다. 연결을 확인한 뒤 새로고침해 주세요.",
              );
          } catch {
            setError(
              "업데이트를 적용하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
            );
          } finally {
            setApplying(false);
          }
        }}
      >
        {applying ? "적용 중…" : "새 버전 적용"}
      </button>
      {error && <span role="alert">{error}</span>}
      <details>
        <summary>버전 정보</summary>
        <small>현재 버전 {appBuildId}</small>
      </details>
    </aside>
  );
}
