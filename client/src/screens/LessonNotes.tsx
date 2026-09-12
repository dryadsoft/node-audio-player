import ManagementDialog from "../components/ManagementDialog";
import CenterManager from "../components/CenterManager";
import InkConflictPreview from "../components/InkConflictPreview";
import { StrokeChoice } from "../api/inkStrokeGroups";
import { usePwaUpdateGuard } from "../offline/updateGuard";
import StatusDialog from "../components/StatusDialog";
import RecoveredInk from "../components/RecoveredInk";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiBookOpen,
  FiCheck,
  FiChevronRight,
  FiRefreshCw,
  FiRepeat,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { InkCanvas } from "@dryadsoft/react-ink-canvas";
import { api } from "../api";
import { noteKey as lessonNoteDraftKey } from "../offline/noteStore";
import {
  useNoteWorkspace,
  useLocalCurriculum,
} from "../offline/useNoteWorkspace";
import NoteOfflineStatus from "../components/NoteOfflineStatus";
import { useLessonNoteSync } from "../hooks/useLessonNoteSync";
import AppNavigation from "../components/AppNavigation";
import LessonWeekDrawer from "../components/LessonWeekDrawer";
import { LessonPlanSummary, LessonTerm } from "../types";

const TERMS: Array<{ value: LessonTerm; label: string }> = [
  { value: "spring", label: "봄학기" },
  { value: "summer", label: "여름학기" },
  { value: "fall", label: "가을학기" },
  { value: "winter", label: "겨울학기" },
];
const TERM_LABELS: Record<LessonTerm, string> = {
  spring: "봄학기",
  summer: "여름학기",
  fall: "가을학기",
  winter: "겨울학기",
};
type ManageDialog = "replace" | "delete" | null;
const EMPTY_REPLACEMENT = "__empty__";

function LessonNotes() {
  const currentYear = new Date().getFullYear();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [menuCurriculumId, setMenuCurriculumId] = useState<string | null>(null);
  const [focusNotebook, setFocusNotebook] = useState(false);
  const curriculumBrowserRef = useRef<HTMLElement>(null);
  const notebookTitleRef = useRef<HTMLHeadingElement>(null);
  const [managing, setManaging] = useState(false),
    [centersOpen, setCentersOpen] = useState(false),
    [centersBusy, setCentersBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createYear, setCreateYear] = useState(currentYear);
  const [createTerm, setCreateTerm] = useState<LessonTerm>("spring");
  const [createProgram, setCreateProgram] = useState("오감별");
  const [sourcePlanId, setSourcePlanId] = useState("");
  const [manageDialog, setManageDialog] = useState<ManageDialog>(null);
  const [replaceSourceId, setReplaceSourceId] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  usePwaUpdateGuard(
    managing || creating || menuCurriculumId !== null || manageDialog
      ? "노트 관리 입력을 마치거나 창을 닫은 뒤 적용해 주세요."
      : ""
  );
  const [checkingDrafts, setCheckingDrafts] = useState(false);
  const activeKey = selectedId
    ? lessonNoteDraftKey(selectedId, selectedWeek)
    : "";

  const offline = useNoteWorkspace();
  const { workspace } = offline;
  const online = offline.connection === "online";
  const curricula = useMemo(
    () =>
      offline.curricula.map((c) => ({
        ...c.summary,
        programName: c.deleted
          ? `${c.summary.programName} · 복구`
          : c.summary.programName,
      })),
    [offline.curricula]
  );
  const curriculaQuery = { isLoading: !offline.hydrated || offline.fetching };
  const plansQuery = useQuery<LessonPlanSummary[]>(
    "lessonPlans",
    () => api.lessonPlans(),
    { enabled: online }
  );
  const plans = useMemo(() => plansQuery.data || [], [plansQuery.data]);
  useEffect(() => {
    if (!selectedId && curricula.length) setSelectedId(curricula[0].id);
    if (selectedId && !curricula.some((item) => item.id === selectedId))
      setSelectedId(curricula[0]?.id || "");
  }, [curricula, selectedId]);
  const detailQuery = useLocalCurriculum(selectedId);
  const sync = useLessonNoteSync(selectedId, selectedWeek);
  const { draft, dirty, saveState, update: updateDraft } = sync;
  const saveMutation = {
    isLoading: saveState === "saving" || saveState === "storing",
  };

  const createMutation = useMutation(api.createLessonCurriculum, {
    onSuccess: async (created) => {
      await workspace.refresh(true);
      setSelectedId(created.id);
      setSelectedWeek(1);
      setCreating(false);
      setManaging(false);
      setSourcePlanId("");
    },
  });

  const refreshAfterAction = async (_curriculumId: string) => {
    await workspace.refresh(true);
    await queryClient.invalidateQueries("lessonPlans");
  };

  const replaceMutation = useMutation(api.replaceLessonCurriculumWeeks, {
    onSuccess: async (replaced) => {
      sync.forget();
      setManageDialog(null);
      setReplaceSourceId("");
      await refreshAfterAction(replaced.id);
      setActionNotice("공통 원본의 12주 수업명과 내용을 교체했습니다.");
    },
    onError: (error: unknown) =>
      setActionError(
        error instanceof Error ? error.message : "12주 교체에 실패했습니다."
      ),
  });

  const deleteMutation = useMutation(api.deleteLessonCurriculum, {
    onSuccess: async (result) => {
      queryClient.removeQueries(["lessonCurriculum", result.id]);
      queryClient.removeQueries(["lessonCurriculumWeek", result.id]);
      setSelectedId("");
      setSelectedWeek(1);
      sync.forget();
      setManageDialog(null);
      setDeleteConfirmed(false);
      await Promise.all([
        workspace.refresh(true),
        queryClient.invalidateQueries("lessonPlans"),
      ]);
      setActionNotice(
        result.detachedPlanCount
          ? `공통 원본을 삭제하고 장소 ${result.detachedPlanCount}곳의 수업명과 내용을 보존했습니다.`
          : "공통 원본을 삭제했습니다."
      );
    },
    onError: (error: unknown) =>
      setActionError(
        error instanceof Error
          ? error.message
          : "공통 원본 삭제에 실패했습니다."
      ),
  });

  const sourcePlans = plans.filter(
    (plan) =>
      plan.locationActive !== false &&
      plan.year === createYear &&
      plan.term === createTerm &&
      plan.programName.normalize("NFC").trim().toLocaleLowerCase("ko") ===
        createProgram.normalize("NFC").trim().toLocaleLowerCase("ko")
  );

  const replacementPlans = detailQuery.data
    ? plans.filter(
        (plan) =>
          plan.locationActive !== false &&
          plan.curriculumId === null &&
          plan.year === detailQuery.data?.year &&
          plan.term === detailQuery.data?.term &&
          plan.programName.normalize("NFC").trim().toLocaleLowerCase("ko") ===
            detailQuery.data?.programName
              .normalize("NFC")
              .trim()
              .toLocaleLowerCase("ko")
      )
    : [];

  const openManageDialog = async (dialog: Exclude<ManageDialog, null>) => {
    if (!detailQuery.data || !online || sync.readOnly) return;
    setActionError("");
    setActionNotice("");
    if (saveState !== "saved" || dirty || saveMutation.isLoading) {
      setActionNotice("현재 주차 저장이 끝난 후 다시 시도하세요.");
      return;
    }
    setCheckingDrafts(true);
    try {
      const pendingWeeks = await workspace.pendingWeeks(selectedId);
      if (pendingWeeks.length) {
        setActionNotice(
          `${pendingWeeks.join(
            ", "
          )}주차에 미저장 내용이 있습니다. 해당 주차를 열어 저장한 후 다시 시도하세요.`
        );
        return;
      }
      setReplaceSourceId("");
      setDeleteConfirmed(false);
      setManageDialog(dialog);
    } catch {
      setActionNotice(
        "미저장 내용을 확인하지 못했습니다. 잠시 후 다시 시도하세요."
      );
    } finally {
      setCheckingDrafts(false);
    }
  };

  const closeManageDialog = () => {
    if (replaceMutation.isLoading || deleteMutation.isLoading) return;
    setManageDialog(null);
    setActionError("");
    setReplaceSourceId("");
    setDeleteConfirmed(false);
  };

  const submitReplacement = () => {
    if (!online || !detailQuery.data || !replaceSourceId) return;
    setActionError("");
    replaceMutation.mutate({
      id: detailQuery.data.id,
      sourcePlanId:
        replaceSourceId === EMPTY_REPLACEMENT ? null : replaceSourceId,
      expectedUpdatedAt: detailQuery.data.updatedAt,
    });
  };

  const submitDelete = () => {
    if (!online || !detailQuery.data || !deleteConfirmed) return;
    setActionError("");
    deleteMutation.mutate({
      id: detailQuery.data.id,
      expectedUpdatedAt: detailQuery.data.updatedAt,
    });
  };

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!online) return;
    createMutation.mutate({
      year: createYear,
      term: createTerm,
      programName: createProgram,
      sourcePlanId: sourcePlanId || undefined,
    });
  };

  const chooseWeek = (curriculumId: string, week: number) => {
    setMenuCurriculumId(null);
    if (curriculumId === selectedId && week === selectedWeek) {
      setFocusNotebook(true);
      return;
    }
    setSelectedId(curriculumId);
    setSelectedWeek(week);
    setFocusNotebook(true);
  };

  useEffect(() => {
    if (
      !focusNotebook ||
      menuCurriculumId !== null ||
      !detailQuery.data ||
      !draft ||
      draft.week !== selectedWeek
    )
      return;
    notebookTitleRef.current?.focus({ preventScroll: true });
    setFocusNotebook(false);
  }, [focusNotebook, menuCurriculumId, selectedWeek, detailQuery.data, draft]);

  useEffect(() => setStatusOpen(false), [activeKey]);

  const saveLabel = {
    saved: "동기화 완료",
    unsaved: "기기에 저장됨 · 동기화 대기",
    storing: "기기에 저장 중...",
    saving: "서버 동기화 중...",
    error: "저장 실패",
    conflict: "충돌 확인",
  }[saveState];

  return (
    <main className="app-shell lesson-shell notes-shell">
      <AppNavigation />
      <header className="compact-header notes-header">
        <h1>공통 수업노트</h1>
        {detailQuery.data ? (
          <div className="notes-header-actions">
            <button
              type="button"
              className={`save-indicator ${saveState}`}
              aria-label="저장 상태 상세"
              aria-haspopup="dialog"
              onClick={() => setStatusOpen(true)}
            >
              <span role="status">
                {saveState === "saved" ? <FiCheck /> : null}
                {saveLabel}
              </span>
            </button>
          </div>
        ) : null}
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setMenuCurriculumId(null);
            setStatusOpen(false);
            setManaging(true);
          }}
        >
          수업노트 관리
        </button>
      </header>

      <NoteOfflineStatus />
      {sync.readOnly ? (
        <p className="curriculum-action-notice">
          서버에서 삭제된 원본의 복구 기록입니다.{" "}
          <button
            className="button secondary"
            onClick={() => workspace.exportData(selectedId)}
          >
            복구 기록 내보내기
          </button>
        </p>
      ) : null}

      {actionNotice && !managing ? (
        <p className="curriculum-action-notice" role="status">
          {actionNotice}
        </p>
      ) : null}

      <button
        className="button secondary notes-menu-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={menuCurriculumId !== null}
        aria-controls="lesson-week-drawer"
        onClick={() => setMenuCurriculumId("")}
      >
        <FiBookOpen aria-hidden="true" /> 학기·주차 선택
      </button>

      {statusOpen && draft ? (
        <StatusDialog title="저장 상태" close={() => setStatusOpen(false)}>
          <p>{saveLabel}</p>
          {sync.error ? (
            <div role="alert">
              {sync.error}{" "}
              <button className="button secondary" onClick={sync.retry}>
                <FiRefreshCw /> 저장 재시도
              </button>
            </div>
          ) : null}
          {sync.conflicts.length ? (
            <section className="note-conflicts" aria-label="충돌 확인">
              <strong>충돌 확인</strong>
              {sync.conflicts.map((conflict) => (
                <div key={conflict.id} className="note-conflict">
                  <b>{conflict.label}</b>
                  {(["local", "server"] as const).map((side) => (
                    <div key={side}>
                      {typeof conflict[side] === "string" ? (
                        <pre>{(conflict[side] as string) || "(빈 내용)"}</pre>
                      ) : (
                        <InkConflictPreview
                          value={conflict[side] as StrokeChoice}
                          label={`${
                            side === "local" ? "이 장비" : "서버"
                          } 필기 미리보기`}
                        />
                      )}
                      <button
                        className="button secondary"
                        onClick={() => sync.resolve(conflict, side)}
                      >
                        {side === "local" ? "이 장비 내용" : "서버 내용"}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          ) : null}
        </StatusDialog>
      ) : null}
      <div className="notes-workspace">
        <aside
          className="curriculum-browser"
          aria-label="공통 수업노트 목록"
          ref={curriculumBrowserRef}
        >
          <div className="plan-browser-heading">
            <span>공통 원본</span>
            <strong>{curricula.length}</strong>
          </div>
          {curricula.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`curriculum-card ${
                selectedId === item.id ? "active" : ""
              }`}
              aria-haspopup="dialog"
              aria-expanded={menuCurriculumId === item.id}
              aria-controls="lesson-week-drawer"
              onClick={() => setMenuCurriculumId(item.id)}
            >
              <b>
                {item.year
                  ? `${item.year}년 ${TERM_LABELS[item.term]}`
                  : "복구 기록"}{" "}
                <FiChevronRight aria-hidden="true" />
              </b>
              <span>{item.programName}</span>
              <small>
                {item.completedWeeks}/12 작성 · 장소 {item.linkedPlanCount}곳
                연결
              </small>
            </button>
          ))}
          {!curriculaQuery.isLoading && !curricula.length ? (
            <div className="empty-state small">
              <FiBookOpen />
              <strong>공통 원본이 없습니다.</strong>
              <span>새 공통 원본으로 시작하세요.</span>
            </div>
          ) : null}
        </aside>

        <section className="notebook-sheet" aria-label="주차별 수업노트">
          {detailQuery.data ? (
            <>
              {draft ? (
                <div className="notebook-page">
                  <div
                    className="notebook-inline-fields"
                    onCompositionStart={() => sync.composition(true)}
                    onCompositionEnd={() => sync.composition(false)}
                  >
                    <h2 ref={notebookTitleRef} tabIndex={-1}>
                      {selectedWeek}주차
                    </h2>
                    <input
                      readOnly={sync.readOnly}
                      aria-label={`${selectedWeek}주차 공통 수업명`}
                      placeholder="수업명"
                      value={draft.className}
                      onChange={(event) =>
                        updateDraft({ className: event.target.value })
                      }
                    />
                    <textarea
                      readOnly={sync.readOnly}
                      aria-label={`${selectedWeek}주차 공통 수업할 내용`}
                      placeholder="수업내용"
                      rows={2}
                      value={draft.content}
                      onChange={(event) =>
                        updateDraft({ content: event.target.value })
                      }
                    />
                  </div>
                  {sync.readOnly ? (
                    <RecoveredInk document={draft.inkDocument} />
                  ) : (
                    <InkCanvas
                      className="notebook-ink-editor"
                      key={activeKey}
                      historyResetKey={sync.resetKey}
                      onInteractionChange={sync.interaction}
                      document={draft.inkDocument}
                      onChange={(inkDocument) => updateDraft({ inkDocument })}
                    />
                  )}
                </div>
              ) : (
                <div className="loading-state">
                  {online
                    ? "주차 노트를 불러오는 중..."
                    : "이 주차는 아직 기기에 저장되지 않았습니다. 온라인 연결 후 다시 열어주세요."}
                </div>
              )}
            </>
          ) : detailQuery.isLoading ? (
            <div className="loading-state">공통 수업노트를 불러오는 중...</div>
          ) : (
            <div className="empty-state">
              <FiBookOpen />
              <strong>공통 원본을 선택하세요.</strong>
            </div>
          )}
        </section>
      </div>

      {menuCurriculumId !== null ? (
        <LessonWeekDrawer
          initialCurriculumId={menuCurriculumId}
          curricula={curricula}
          selectedId={selectedId}
          selectedWeek={selectedWeek}
          anchorRef={curriculumBrowserRef}
          onClose={() => setMenuCurriculumId(null)}
          onSelect={chooseWeek}
        />
      ) : null}

      {managing && (
        <ManagementDialog
          title="수업노트 관리"
          busy={
            centersBusy ||
            createMutation.isLoading ||
            replaceMutation.isLoading ||
            deleteMutation.isLoading ||
            checkingDrafts
          }
          onClose={() => {
            if (centersOpen) setCentersOpen(false);
            else if (manageDialog) closeManageDialog();
            else if (creating) setCreating(false);
            else setManaging(false);
          }}
        >
          {centersOpen ? (
            <CenterManager
              onBack={() => setCentersOpen(false)}
              onBusyChange={setCentersBusy}
            />
          ) : (
            <>
              {actionNotice && <p role="status">{actionNotice}</p>}
              {!creating && !manageDialog && (
                <>
                  <div className="management-actions">
                    <button
                      disabled={!online}
                      onClick={() => setCreating(true)}
                    >
                      새 공통 원본
                    </button>
                    <button onClick={() => setCentersOpen(true)}>
                      공통 센터 관리
                    </button>
                  </div>
                  <h3>현재 원본 관리</h3>
                  <p>
                    {detailQuery.data
                      ? `${detailQuery.data.year}년 ${
                          TERM_LABELS[detailQuery.data.term]
                        } · ${detailQuery.data.programName}`
                      : "선택된 원본이 없습니다."}
                  </p>
                  <div className="management-actions">
                    <button
                      disabled={
                        !online ||
                        !detailQuery.data ||
                        sync.readOnly ||
                        checkingDrafts ||
                        saveState !== "saved"
                      }
                      onClick={() => void openManageDialog("replace")}
                    >
                      12주 교체
                    </button>
                    <button
                      disabled={
                        !online ||
                        !detailQuery.data ||
                        sync.readOnly ||
                        checkingDrafts ||
                        saveState !== "saved"
                      }
                      onClick={() => void openManageDialog("delete")}
                    >
                      원본 삭제
                    </button>
                  </div>
                  {!online && (
                    <p>
                      원본 생성·교체·삭제와 센터 변경은 온라인에서 사용할 수
                      있습니다.
                    </p>
                  )}
                </>
              )}
              {creating ? (
                <fieldset
                  disabled={createMutation.isLoading}
                  style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                >
                  <form className="curriculum-create" onSubmit={submitCreate}>
                    <label>
                      <span>연도</span>
                      <input
                        aria-label="공통 원본 연도"
                        type="number"
                        min="2000"
                        max="9999"
                        value={createYear}
                        onChange={(event) => {
                          setCreateYear(Number(event.target.value));
                          setSourcePlanId("");
                        }}
                      />
                    </label>
                    <label>
                      <span>학기</span>
                      <select
                        aria-label="공통 원본 학기"
                        value={createTerm}
                        onChange={(event) => {
                          setCreateTerm(event.target.value as LessonTerm);
                          setSourcePlanId("");
                        }}
                      >
                        {TERMS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>프로그램</span>
                      <input
                        aria-label="공통 원본 프로그램"
                        value={createProgram}
                        onChange={(event) => {
                          setCreateProgram(event.target.value);
                          setSourcePlanId("");
                        }}
                        required
                      />
                    </label>
                    <label className="curriculum-source">
                      <span>기존 계획서에서 가져오기</span>
                      <select
                        aria-label="가져올 기존 계획서"
                        value={sourcePlanId}
                        onChange={(event) =>
                          setSourcePlanId(event.target.value)
                        }
                      >
                        <option value="">빈 12주로 시작</option>
                        {sourcePlans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.locationName}
                            {plan.sectionName ? ` · ${plan.sectionName}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="curriculum-create-actions">
                      <button
                        className="button ghost"
                        type="button"
                        disabled={createMutation.isLoading}
                        onClick={() => setCreating(false)}
                      >
                        취소
                      </button>
                      <button
                        className="button accent"
                        type="submit"
                        disabled={!online || createMutation.isLoading}
                      >
                        {createMutation.isLoading
                          ? "생성 중..."
                          : "12주 원본 생성"}
                      </button>
                    </div>
                    {createMutation.isError ? (
                      <p className="form-error">
                        {createMutation.error instanceof Error
                          ? createMutation.error.message
                          : "공통 원본을 만들지 못했습니다."}
                      </p>
                    ) : null}
                  </form>
                </fieldset>
              ) : null}

              {manageDialog === "replace" && detailQuery.data ? (
                <section>
                  <header className="dialog-heading">
                    <div>
                      <span className="eyebrow">REPLACE SHARED WEEKS</span>
                      <h2 id="curriculum-replace-title">공통 12주 교체</h2>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="12주 교체 닫기"
                      onClick={closeManageDialog}
                    >
                      <FiX />
                    </button>
                  </header>
                  <p>
                    연결된 장소 {detailQuery.data.linkedPlanCount}곳의 수업명과
                    내용이 즉시 바뀝니다. 기존 필기는 유지됩니다.
                  </p>
                  <label className="curriculum-action-source">
                    <span>가져올 12주</span>
                    <select
                      disabled={replaceMutation.isLoading}
                      aria-label="교체할 12주 원본"
                      value={replaceSourceId}
                      onChange={(event) =>
                        setReplaceSourceId(event.target.value)
                      }
                      autoFocus
                    >
                      <option value="">원본을 선택하세요</option>
                      <option value={EMPTY_REPLACEMENT}>
                        수업명·내용 비우기 (필기 유지)
                      </option>
                      {replacementPlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.locationName}
                          {plan.sectionName ? ` · ${plan.sectionName}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {actionError ? (
                    <p className="form-error" role="alert">
                      {actionError}
                    </p>
                  ) : null}
                  <div className="dialog-actions">
                    <button
                      className="button ghost"
                      type="button"
                      onClick={closeManageDialog}
                    >
                      취소
                    </button>
                    <button
                      className="button accent"
                      type="button"
                      disabled={
                        !online || !replaceSourceId || replaceMutation.isLoading
                      }
                      onClick={submitReplacement}
                    >
                      <FiRepeat />{" "}
                      {replaceMutation.isLoading ? "교체 중..." : "12주 교체"}
                    </button>
                  </div>
                </section>
              ) : null}

              {manageDialog === "delete" && detailQuery.data ? (
                <section>
                  <header className="dialog-heading">
                    <div>
                      <span className="eyebrow">DELETE SHARED NOTEBOOK</span>
                      <h2 id="curriculum-delete-title">공통 원본 삭제</h2>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="공통 원본 삭제 닫기"
                      onClick={closeManageDialog}
                    >
                      <FiX />
                    </button>
                  </header>
                  <div className="curriculum-delete-warning">
                    <FiAlertTriangle aria-hidden="true" />
                    <div>
                      <b>
                        {detailQuery.data.year}년{" "}
                        {TERM_LABELS[detailQuery.data.term]} ·{" "}
                        {detailQuery.data.programName}
                      </b>
                      <span>
                        {detailQuery.data.completedWeeks}/12 작성 · 장소{" "}
                        {detailQuery.data.linkedPlanCount}곳 연결
                      </span>
                    </div>
                  </div>
                  <p>
                    연결된 장소에는 현재 수업명·내용을 복사한 뒤 연결을
                    해제합니다. 공통 원본의 필기는 영구 삭제됩니다.
                  </p>
                  <label className="curriculum-delete-confirm">
                    <input
                      type="checkbox"
                      disabled={deleteMutation.isLoading}
                      checked={deleteConfirmed}
                      onChange={(event) =>
                        setDeleteConfirmed(event.target.checked)
                      }
                      autoFocus
                    />
                    <span>삭제되는 내용을 확인했습니다.</span>
                  </label>
                  {actionError ? (
                    <p className="form-error" role="alert">
                      {actionError}
                    </p>
                  ) : null}
                  <div className="dialog-actions">
                    <button
                      className="button ghost"
                      type="button"
                      onClick={closeManageDialog}
                    >
                      취소
                    </button>
                    <button
                      className="button danger"
                      type="button"
                      disabled={
                        !online || !deleteConfirmed || deleteMutation.isLoading
                      }
                      onClick={submitDelete}
                    >
                      <FiTrash2 />{" "}
                      {deleteMutation.isLoading ? "삭제 중..." : "영구 삭제"}
                    </button>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </ManagementDialog>
      )}
    </main>
  );
}

export default LessonNotes;
