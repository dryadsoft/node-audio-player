import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiBookOpen,
  FiCheck,
  FiPlus,
  FiRefreshCw,
  FiRepeat,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { api } from "../api";
import {
  clearLessonNoteDraft,
  lessonNoteDraftKey,
  loadLessonNoteDraft,
  saveLessonNoteDraft,
} from "../api/lessonNoteDrafts";
import AppNavigation from "../components/AppNavigation";
import InkCanvas from "../components/InkCanvas";
import {
  LessonCurriculum,
  LessonCurriculumSummary,
  LessonCurriculumWeek,
  LessonPlanSummary,
  LessonTerm,
} from "../types";

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
type SaveState = "saved" | "unsaved" | "saving" | "error" | "recovered";
type ManageDialog = "replace" | "delete" | null;
const EMPTY_REPLACEMENT = "__empty__";

interface SaveVariables {
  curriculumId: string;
  key: string;
  version: number;
  data: LessonCurriculumWeek;
}

function LessonNotes() {
  const currentYear = new Date().getFullYear();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [creating, setCreating] = useState(false);
  const [createYear, setCreateYear] = useState(currentYear);
  const [createTerm, setCreateTerm] = useState<LessonTerm>("spring");
  const [createProgram, setCreateProgram] = useState("오감별");
  const [sourcePlanId, setSourcePlanId] = useState("");
  const [draft, setDraft] = useState<LessonCurriculumWeek>();
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [manageDialog, setManageDialog] = useState<ManageDialog>(null);
  const [replaceSourceId, setReplaceSourceId] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [checkingDrafts, setCheckingDrafts] = useState(false);
  const editVersion = useRef(0);
  const loadedKey = useRef("");
  const activeKey = selectedId
    ? lessonNoteDraftKey(selectedId, selectedWeek)
    : "";
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;

  const curriculaQuery = useQuery<LessonCurriculumSummary[]>(
    "lessonCurricula",
    () => api.lessonCurricula(),
  );
  const plansQuery = useQuery<LessonPlanSummary[]>("lessonPlans", () =>
    api.lessonPlans(),
  );
  const curricula = useMemo(
    () => curriculaQuery.data || [],
    [curriculaQuery.data],
  );
  const plans = useMemo(() => plansQuery.data || [], [plansQuery.data]);

  useEffect(() => {
    if (!selectedId && curricula.length) setSelectedId(curricula[0].id);
    if (selectedId && !curricula.some((item) => item.id === selectedId)) {
      setSelectedId(curricula[0]?.id || "");
    }
  }, [curricula, selectedId]);

  const detailQuery = useQuery<LessonCurriculum>(
    ["lessonCurriculum", selectedId],
    () => api.lessonCurriculum(selectedId),
    { enabled: Boolean(selectedId) },
  );
  const weekQuery = useQuery<LessonCurriculumWeek>(
    ["lessonCurriculumWeek", selectedId, selectedWeek],
    () => api.lessonCurriculumWeek(selectedId, selectedWeek),
    { enabled: Boolean(selectedId) },
  );

  useEffect(() => {
    if (!weekQuery.data || !activeKey || loadedKey.current === activeKey) return;
    let active = true;
    loadedKey.current = activeKey;
    const serverWeek = weekQuery.data;
    setDraft(serverWeek);
    setDirty(false);
    setSaveState("saved");
    loadLessonNoteDraft(activeKey)
      .then((recovered) => {
        if (!active || !recovered) return;
        if (recovered.revision === serverWeek.revision) {
          setDraft(recovered);
          setDirty(true);
          setSaveState("recovered");
          editVersion.current += 1;
        } else {
          clearLessonNoteDraft(activeKey).catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activeKey, weekQuery.data]);

  const saveMutation = useMutation<
    LessonCurriculumWeek,
    unknown,
    SaveVariables
  >(
    ({ curriculumId, data }) =>
      api.updateLessonCurriculumWeek({ ...data, id: curriculumId }),
    {
      onMutate: () => setSaveState("saving"),
      onSuccess: async (saved, variables) => {
        queryClient.setQueryData(
          ["lessonCurriculumWeek", variables.curriculumId, saved.week],
          saved,
        );
        await Promise.all([
          queryClient.invalidateQueries("lessonCurricula"),
          queryClient.invalidateQueries([
            "lessonCurriculum",
            variables.curriculumId,
          ]),
          queryClient.invalidateQueries("lessonPlans"),
        ]);
        if (variables.key !== activeKeyRef.current) return;
        if (variables.version === editVersion.current) {
          await clearLessonNoteDraft(variables.key).catch(() => undefined);
          setDraft(saved);
          setDirty(false);
          setSaveState("saved");
        } else {
          setDraft((current) => {
            if (!current) return current;
            const next = { ...current, revision: saved.revision };
            saveLessonNoteDraft(variables.key, next).catch(() => undefined);
            return next;
          });
          setSaveState("unsaved");
        }
      },
      onError: () => setSaveState("error"),
    },
  );

  useEffect(() => {
    if (
      !dirty ||
      !draft ||
      !activeKey ||
      saveMutation.isLoading ||
      saveState === "error"
    ) {
      return;
    }
    const timer = window.setTimeout(
      () =>
        saveMutation.mutate({
          curriculumId: selectedId,
          key: activeKey,
          version: editVersion.current,
          data: draft,
        }),
      700,
    );
    return () => window.clearTimeout(timer);
  }, [activeKey, dirty, draft, saveMutation, saveState, selectedId]);

  const updateDraft = (
    changes:
      | Partial<LessonCurriculumWeek>
      | ((current: LessonCurriculumWeek) => LessonCurriculumWeek),
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const next =
        typeof changes === "function"
          ? changes(current)
          : { ...current, ...changes };
      editVersion.current += 1;
      setDirty(true);
      setSaveState("unsaved");
      if (activeKey) saveLessonNoteDraft(activeKey, next).catch(() => undefined);
      return next;
    });
  };

  const createMutation = useMutation(api.createLessonCurriculum, {
    onSuccess: async (created) => {
      await queryClient.invalidateQueries("lessonCurricula");
      setSelectedId(created.id);
      setSelectedWeek(1);
      setCreating(false);
      setSourcePlanId("");
    },
  });

  const clearCurriculumDrafts = (curriculumId: string) =>
    Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        clearLessonNoteDraft(lessonNoteDraftKey(curriculumId, index + 1)).catch(
          () => undefined,
        ),
      ),
    );

  const refreshAfterAction = async (curriculumId: string) => {
    await Promise.all([
      queryClient.invalidateQueries("lessonCurricula"),
      queryClient.invalidateQueries(["lessonCurriculum", curriculumId]),
      queryClient.invalidateQueries(["lessonCurriculumWeek", curriculumId]),
      queryClient.invalidateQueries("lessonPlans"),
    ]);
  };

  const replaceMutation = useMutation(api.replaceLessonCurriculumWeeks, {
    onSuccess: async (replaced) => {
      await clearCurriculumDrafts(replaced.id);
      loadedKey.current = "";
      setDraft(undefined);
      setDirty(false);
      setSaveState("saved");
      setManageDialog(null);
      setReplaceSourceId("");
      await refreshAfterAction(replaced.id);
      setActionNotice("공통 원본의 12주 수업명과 내용을 교체했습니다.");
    },
    onError: (error: unknown) =>
      setActionError(
        error instanceof Error ? error.message : "12주 교체에 실패했습니다.",
      ),
  });

  const deleteMutation = useMutation(api.deleteLessonCurriculum, {
    onSuccess: async (result) => {
      await clearCurriculumDrafts(result.id);
      queryClient.removeQueries(["lessonCurriculum", result.id]);
      queryClient.removeQueries(["lessonCurriculumWeek", result.id]);
      setSelectedId("");
      setSelectedWeek(1);
      setDraft(undefined);
      setDirty(false);
      setSaveState("saved");
      setManageDialog(null);
      setDeleteConfirmed(false);
      await Promise.all([
        queryClient.invalidateQueries("lessonCurricula"),
        queryClient.invalidateQueries("lessonPlans"),
      ]);
      setActionNotice(
        result.detachedPlanCount
          ? `공통 원본을 삭제하고 장소 ${result.detachedPlanCount}곳의 수업명과 내용을 보존했습니다.`
          : "공통 원본을 삭제했습니다.",
      );
    },
    onError: (error: unknown) =>
      setActionError(
        error instanceof Error ? error.message : "공통 원본 삭제에 실패했습니다.",
      ),
  });

  const sourcePlans = plans.filter(
    (plan) =>
      plan.year === createYear &&
      plan.term === createTerm &&
      plan.programName.normalize("NFC").trim().toLocaleLowerCase("ko") ===
        createProgram.normalize("NFC").trim().toLocaleLowerCase("ko"),
  );

  const replacementPlans = detailQuery.data
    ? plans.filter(
        (plan) =>
          plan.curriculumId === null &&
          plan.year === detailQuery.data?.year &&
          plan.term === detailQuery.data?.term &&
          plan.programName.normalize("NFC").trim().toLocaleLowerCase("ko") ===
            detailQuery.data?.programName
              .normalize("NFC")
              .trim()
              .toLocaleLowerCase("ko"),
      )
    : [];

  const openManageDialog = async (dialog: Exclude<ManageDialog, null>) => {
    if (!detailQuery.data) return;
    setActionError("");
    setActionNotice("");
    if (saveState !== "saved" || dirty || saveMutation.isLoading) {
      setActionNotice("현재 주차 저장이 끝난 후 다시 시도하세요.");
      return;
    }
    setCheckingDrafts(true);
    try {
      const drafts = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          loadLessonNoteDraft(lessonNoteDraftKey(selectedId, index + 1)),
        ),
      );
      const pendingWeeks = drafts.flatMap((item, index) =>
        item ? [index + 1] : [],
      );
      if (pendingWeeks.length) {
        setActionNotice(
          `${pendingWeeks.join(", ")}주차에 미저장 내용이 있습니다. 해당 주차를 열어 저장한 후 다시 시도하세요.`,
        );
        return;
      }
      setReplaceSourceId("");
      setDeleteConfirmed(false);
      setManageDialog(dialog);
    } catch {
      setActionNotice("미저장 내용을 확인하지 못했습니다. 잠시 후 다시 시도하세요.");
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
    if (!detailQuery.data || !replaceSourceId) return;
    setActionError("");
    replaceMutation.mutate({
      id: detailQuery.data.id,
      sourcePlanId:
        replaceSourceId === EMPTY_REPLACEMENT ? null : replaceSourceId,
      expectedUpdatedAt: detailQuery.data.updatedAt,
    });
  };

  const submitDelete = () => {
    if (!detailQuery.data || !deleteConfirmed) return;
    setActionError("");
    deleteMutation.mutate({
      id: detailQuery.data.id,
      expectedUpdatedAt: detailQuery.data.updatedAt,
    });
  };

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate({
      year: createYear,
      term: createTerm,
      programName: createProgram,
      sourcePlanId: sourcePlanId || undefined,
    });
  };

  const chooseWeek = (week: number) => {
    loadedKey.current = "";
    setSelectedWeek(week);
    setDraft(undefined);
    setDirty(false);
    setSaveState("saved");
  };

  const saveLabel = {
    saved: "저장 완료",
    unsaved: "저장 대기",
    saving: "저장 중...",
    error: "저장 실패",
    recovered: "미저장 내용 복구",
  }[saveState];

  return (
    <main className="app-shell lesson-shell notes-shell">
      <AppNavigation />
      <header className="lesson-hero notes-hero">
        <div className="lesson-hero-mark" aria-hidden="true">✎</div>
        <div>
          <span className="eyebrow">SHARED 12-WEEK NOTEBOOK</span>
          <h1>공통 수업노트</h1>
          <p>한 번 작성한 수업명과 내용을 모든 연결 장소에서 함께 씁니다.</p>
        </div>
        <button
          className="button accent"
          type="button"
          onClick={() => setCreating((current) => !current)}
        >
          <FiPlus /> 새 공통 원본
        </button>
      </header>

      {creating ? (
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
                <option key={item.value} value={item.value}>{item.label}</option>
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
              onChange={(event) => setSourcePlanId(event.target.value)}
            >
              <option value="">빈 12주로 시작</option>
              {sourcePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.locationName}{plan.sectionName ? ` · ${plan.sectionName}` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="curriculum-create-actions">
            <button className="button ghost" type="button" onClick={() => setCreating(false)}>
              취소
            </button>
            <button className="button accent" type="submit" disabled={createMutation.isLoading}>
              {createMutation.isLoading ? "생성 중..." : "12주 원본 생성"}
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
      ) : null}

      {actionNotice ? (
        <p className="curriculum-action-notice" role="status">
          {actionNotice}
        </p>
      ) : null}

      <div className="notes-workspace">
        <aside className="curriculum-browser" aria-label="공통 수업노트 목록">
          <div className="plan-browser-heading">
            <span>공통 원본</span>
            <strong>{curricula.length}</strong>
          </div>
          {curricula.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`curriculum-card ${selectedId === item.id ? "active" : ""}`}
              onClick={() => {
                loadedKey.current = "";
                setSelectedId(item.id);
                chooseWeek(1);
              }}
            >
              <b>{item.year}년 {TERM_LABELS[item.term]}</b>
              <span>{item.programName}</span>
              <small>{item.completedWeeks}/12 작성 · 장소 {item.linkedPlanCount}곳 연결</small>
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
              <header className="notebook-heading">
                <div>
                  <span className="eyebrow">{detailQuery.data.year} SHARED COURSE</span>
                  <h2>{TERM_LABELS[detailQuery.data.term]} · {detailQuery.data.programName}</h2>
                </div>
                <div className="notebook-heading-actions">
                  <span className={`save-indicator ${saveState}`} role="status">
                    {saveState === "saved" ? <FiCheck /> : null}{saveLabel}
                  </span>
                  <button
                    className="button secondary curriculum-manage-button"
                    type="button"
                    disabled={checkingDrafts || saveState !== "saved"}
                    onClick={() => openManageDialog("replace")}
                  >
                    <FiRepeat /> 12주 교체
                  </button>
                  <button
                    className="button danger curriculum-manage-button"
                    type="button"
                    disabled={checkingDrafts || saveState !== "saved"}
                    onClick={() => openManageDialog("delete")}
                  >
                    <FiTrash2 /> 원본 삭제
                  </button>
                </div>
              </header>
              <nav className="week-tabs" aria-label="주차 선택">
                {detailQuery.data.weeks.map((week) => (
                  <button
                    type="button"
                    key={week.week}
                    className={`${selectedWeek === week.week ? "active" : ""} ${
                      week.hasInk || week.className || week.content || week.lessonPlan || week.materials
                        ? "filled"
                        : ""
                    }`}
                    onClick={() => chooseWeek(week.week)}
                  >
                    <b>{week.week}</b><span>주차</span>
                  </button>
                ))}
              </nav>
              {draft ? (
                <div className="notebook-page">
                  <div className="notebook-page-heading">
                    <div><b>{selectedWeek}주차</b><span>공통 수업 기록</span></div>
                    {saveState === "error" ? (
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => setSaveState("unsaved")}
                      >
                        <FiRefreshCw /> 저장 재시도
                      </button>
                    ) : null}
                  </div>
                  <details className="note-text-fields">
                    <summary>키보드 입력 열기 <span>선택 사항</span></summary>
                    <div className="note-text-grid">
                      <label>
                        <span>수업명 <small>계획서 반영</small></span>
                        <input
                          aria-label={`${selectedWeek}주차 공통 수업명`}
                          value={draft.className}
                          onChange={(event) => updateDraft({ className: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>수업할 내용 <small>계획서 반영</small></span>
                        <textarea
                          aria-label={`${selectedWeek}주차 공통 수업할 내용`}
                          rows={3}
                          value={draft.content}
                          onChange={(event) => updateDraft({ content: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>진행 플랜 <small>노트 전용</small></span>
                        <textarea
                          aria-label={`${selectedWeek}주차 진행 플랜`}
                          rows={3}
                          value={draft.lessonPlan}
                          onChange={(event) => updateDraft({ lessonPlan: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>사용 교구 <small>노트 전용</small></span>
                        <textarea
                          aria-label={`${selectedWeek}주차 사용 교구`}
                          rows={3}
                          value={draft.materials}
                          onChange={(event) => updateDraft({ materials: event.target.value })}
                        />
                      </label>
                    </div>
                  </details>
                  <div className="ink-boundary-note">
                    자유 필기는 수업노트에만 저장되며 강의계획서와 DOCX에는 표시되지 않습니다.
                  </div>
                  <InkCanvas
                    key={activeKey}
                    document={draft.inkDocument}
                    onChange={(inkDocument) => updateDraft({ inkDocument })}
                  />
                </div>
              ) : (
                <div className="loading-state">주차 노트를 불러오는 중...</div>
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

      {manageDialog === "replace" && detailQuery.data ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="dialog-card curriculum-action-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="curriculum-replace-title"
          >
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
              연결된 장소 {detailQuery.data.linkedPlanCount}곳의 수업명과 내용이
              즉시 바뀝니다. 기존 필기·진행 플랜·사용 교구는 유지됩니다.
            </p>
            <label className="curriculum-action-source">
              <span>가져올 12주</span>
              <select
                aria-label="교체할 12주 원본"
                value={replaceSourceId}
                onChange={(event) => setReplaceSourceId(event.target.value)}
                autoFocus
              >
                <option value="">원본을 선택하세요</option>
                <option value={EMPTY_REPLACEMENT}>
                  수업명·내용 비우기 (필기·플랜·교구 유지)
                </option>
                {replacementPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.locationName}{plan.sectionName ? ` · ${plan.sectionName}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
            <div className="dialog-actions">
              <button className="button ghost" type="button" onClick={closeManageDialog}>
                취소
              </button>
              <button
                className="button accent"
                type="button"
                disabled={!replaceSourceId || replaceMutation.isLoading}
                onClick={submitReplacement}
              >
                <FiRepeat /> {replaceMutation.isLoading ? "교체 중..." : "12주 교체"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {manageDialog === "delete" && detailQuery.data ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="dialog-card curriculum-action-dialog danger-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="curriculum-delete-title"
          >
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
                <b>{detailQuery.data.year}년 {TERM_LABELS[detailQuery.data.term]} · {detailQuery.data.programName}</b>
                <span>{detailQuery.data.completedWeeks}/12 작성 · 장소 {detailQuery.data.linkedPlanCount}곳 연결</span>
              </div>
            </div>
            <p>
              연결된 장소에는 현재 수업명·내용을 복사한 뒤 연결을 해제합니다.
              공통 원본의 필기·진행 플랜·사용 교구는 영구 삭제됩니다.
            </p>
            <label className="curriculum-delete-confirm">
              <input
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(event) => setDeleteConfirmed(event.target.checked)}
                autoFocus
              />
              <span>삭제되는 내용을 확인했습니다.</span>
            </label>
            {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
            <div className="dialog-actions">
              <button className="button ghost" type="button" onClick={closeManageDialog}>
                취소
              </button>
              <button
                className="button danger"
                type="button"
                disabled={!deleteConfirmed || deleteMutation.isLoading}
                onClick={submitDelete}
              >
                <FiTrash2 /> {deleteMutation.isLoading ? "삭제 중..." : "영구 삭제"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default LessonNotes;
