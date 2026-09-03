import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { FiBookOpen, FiCheck, FiPlus, FiRefreshCw } from "react-icons/fi";
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

  const sourcePlans = plans.filter(
    (plan) =>
      plan.year === createYear &&
      plan.term === createTerm &&
      plan.programName.normalize("NFC").trim().toLocaleLowerCase("ko") ===
        createProgram.normalize("NFC").trim().toLocaleLowerCase("ko"),
  );

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
                <span className={`save-indicator ${saveState}`} role="status">
                  {saveState === "saved" ? <FiCheck /> : null}{saveLabel}
                </span>
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
    </main>
  );
}

export default LessonNotes;
