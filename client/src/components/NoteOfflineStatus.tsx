import { useEffect, useState } from "react";
import { pwaState, subscribePwa } from "../offline/pwa";
import { useNoteWorkspace } from "../offline/useNoteWorkspace";

export default function NoteOfflineStatus() {
  const state = useNoteWorkspace();
  const [pwa, setPwa] = useState(pwaState);
  useEffect(() => subscribePwa(() => setPwa(pwaState())), []);
  useEffect(() => {
    if (navigator.storage?.persist)
      void navigator.storage.persist().catch(() => undefined);
  }, []);
  const active = state.curricula.filter((c) => !c.deleted);
  const total = active.length * 12;
  const downloaded = state.notes.filter((n) =>
    active.some((c) => c.id === n.id)
  ).length;
  const pending = state.workspace.pendingCount();
  const complete =
    state.hydrated &&
    total === downloaded &&
    ["ready", "update"].includes(pwa) &&
    !!state.lastSynced;
  const label = state.storageError
    ? "기기 저장 실패"
    : complete
    ? "오프라인 준비 완료"
    : `오프라인 준비 중 · ${downloaded}/${total}주 저장`;
  const connection = {
    checking: "연결 확인 중",
    online: "온라인",
    offline: "오프라인",
    auth: "로그인 필요",
    error: "연결 확인 필요",
  }[state.connection];
  return (
    <details className="note-offline-status">
      <summary>
        <span>{label}</span>
        <span>
          {connection} · 미전송 {pending}건
        </span>
      </summary>
      <div className="note-offline-details">
        <p>
          {state.lastSynced
            ? `마지막 서버 확인: ${new Date(state.lastSynced).toLocaleString(
                "ko-KR"
              )}`
            : "첫 온라인 접속에서 모든 노트를 저장합니다."}
        </p>
        <p>
          앱을 열어 두면 자동 동기화합니다. 노트 생성·삭제·12주 교체는
          온라인에서 사용합니다.
        </p>
        {state.curricula.map((c) => (
          <p key={c.id}>
            {c.summary.programName}:{" "}
            {state.notes.filter((n) => n.id === c.id).length}/12주
            {c.deleted ? " · 복구 기록" : ""}
          </p>
        ))}
        {state.storageError ? <p role="alert">{state.storageError}</p> : null}
        {state.connection === "auth" ? (
          <p>
            로그인 후 동기화를 계속합니다. 저장된 노트는 계속 편집할 수
            있습니다.
          </p>
        ) : null}
        {state.error && state.connection !== "auth" ? (
          <p>{state.error}</p>
        ) : null}
        {pwa === "unsupported" ? (
          <p>오프라인 재실행은 HTTPS로 배포한 앱에서 지원합니다.</p>
        ) : null}
        {pwa === "error" ? (
          <p>
            앱 화면을 저장하지 못했습니다. 연결과 로그인을 확인한 뒤 다시
            열어주세요.
          </p>
        ) : null}
        {pwa === "update" ? (
          <p>
            새 버전이 준비됐습니다. 입력 저장 후 앱과 같은 사이트의 탭을 모두
            닫고 다시 열면 적용됩니다.
          </p>
        ) : null}
        <div className="note-offline-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => void state.workspace.retry()}
          >
            동기화 재시도
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => state.workspace.exportData()}
          >
            기기 기록 내보내기
          </button>
          {state.connection !== "online" ? (
            <button
              type="button"
              className="button secondary"
              disabled={!state.workspace.canNavigate()}
              onClick={() => {
                if (state.workspace.canNavigate())
                  window.location.assign("/lesson-notes?reauth=1");
              }}
            >
              다시 로그인
            </button>
          ) : null}
        </div>
        <p>
          iPad: Safari 공유 → 홈 화면에 추가. Android: Chrome 메뉴 → 앱 설치.
          설치한 앱에서 처음 한 번 다운로드를 완료하세요.
        </p>
      </div>
    </details>
  );
}
