import { useContext, useState } from "react";
import { ApiError } from "../api";
import { NoteWorkspaceContext } from "../offline/useNoteWorkspace";
import { attendanceWorkspace } from "../attendance/workspace";
import { reauthUrl } from "../offline/pwa";

export default function RequestFailure({ error, retry }: { error: unknown; retry: () => void }) {
  const notes = useContext(NoteWorkspaceContext);
  const [blocked, setBlocked] = useState(false);
  if (!error) return null;
  const auth = error instanceof ApiError && [401, 403].includes(error.status);
  const message = auth ? "로그인이 필요합니다. 기존 기록은 보존됩니다."
    : error instanceof ApiError ? error.message
    : "서버에 연결하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.";
  return <div className="request-failure" role="alert">
    <span>{message}</span>
    <button type="button" className="button secondary" onClick={retry}>다시 시도</button>
    <button type="button" className="button secondary" onClick={() => {
      if (!notes.canNavigate() || attendanceWorkspace.getSnapshot().unsaved) {
        setBlocked(true); return;
      }
      window.location.assign(reauthUrl());
    }}>다시 로그인</button>
    {blocked && <p>기기에 저장되지 않은 입력이 있습니다. 수업노트·출석부에서 저장하거나 기록을 내보낸 뒤 다시 로그인하세요.</p>}
  </div>;
}
