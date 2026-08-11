import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  FiBookOpen,
  FiCheck,
  FiClipboard,
  FiCopy,
  FiEdit2,
  FiMapPin,
  FiPlus,
  FiSave,
  FiSettings,
  FiX,
} from "react-icons/fi";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { api } from "../api";
import AppNavigation from "../components/AppNavigation";
import LessonLocationDialog from "../components/LessonLocationDialog";
import {
  LessonLocation,
  LessonPlan,
  LessonPlanInput,
  LessonPlanSummary,
  LessonTerm,
  LessonWeek,
} from "../types";

const TERMS: Array<{ value: LessonTerm; label: string }> = [
  { value: "spring", label: "봄학기" },
  { value: "summer", label: "여름학기" },
  { value: "fall", label: "가을학기" },
  { value: "winter", label: "겨울학기" },
];

const TERM_LABELS = TERMS.reduce<Record<LessonTerm, string>>(
  (labels, term) => ({ ...labels, [term.value]: term.label }),
  {
    spring: "봄학기",
    summer: "여름학기",
    fall: "가을학기",
    winter: "겨울학기",
  }
);

const createEmptyWeeks = (): LessonWeek[] =>
  Array.from({ length: 12 }, (_, index) => ({
    week: index + 1,
    className: "",
    content: "",
  }));

interface EditorDraft extends LessonPlanInput {
  id?: string;
  revision?: number;
  kind: "new" | "edit" | "copy";
}

interface WeekMapping {
  sourceWeek: number;
  targetWeek: number;
}

interface Notice {
  id: number;
  message: string;
  type: "success" | "error";
}

const completedWeekCount = (weeks: LessonWeek[]) =>
  weeks.filter((week) => week.className.trim() && week.content.trim()).length;

function LessonPlans() {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [term, setTerm] = useState<LessonTerm | "">("");
  const [locationId, setLocationId] = useState("");
  const [programName, setProgramName] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [editor, setEditor] = useState<EditorDraft>();
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copySourceId, setCopySourceId] = useState("");
  const [weekMappings, setWeekMappings] = useState<WeekMapping[]>([]);
  const [notice, setNotice] = useState<Notice>();

  const locationsQuery = useQuery<LessonLocation[]>(
    "lessonLocations",
    api.lessonLocations
  );
  const plansQuery = useQuery<LessonPlanSummary[]>("lessonPlans", () =>
    api.lessonPlans()
  );
  const locations = useMemo(
    () => locationsQuery.data || [],
    [locationsQuery.data]
  );
  const plans = useMemo(() => plansQuery.data || [], [plansQuery.data]);
  const activeLocations = useMemo(
    () => locations.filter((location) => location.active),
    [locations]
  );
  const programNames = useMemo(
    () =>
      Array.from(new Set(plans.map((plan) => plan.programName))).sort((a, b) =>
        a.localeCompare(b, "ko")
      ),
    [plans]
  );
  const years = useMemo(
    () =>
      Array.from(
        new Set([currentYear, ...plans.map((plan) => plan.year)])
      ).sort((left, right) => right - left),
    [currentYear, plans]
  );
  const filteredPlans = useMemo(
    () =>
      plans.filter(
        (plan) =>
          plan.year === year &&
          (!term || plan.term === term) &&
          (!locationId || plan.locationId === locationId) &&
          (!programName || plan.programName === programName)
      ),
    [locationId, plans, programName, term, year]
  );

  useEffect(() => {
    if (editor) return;
    if (!filteredPlans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(filteredPlans[0]?.id || "");
    }
  }, [editor, filteredPlans, selectedPlanId]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(
      () =>
        setNotice((current) =>
          current?.id === notice.id ? undefined : current
        ),
      notice.type === "success" ? 3000 : 5000
    );
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const detailQuery = useQuery<LessonPlan>(
    ["lessonPlan", selectedPlanId],
    () => api.lessonPlan(selectedPlanId),
    { enabled: Boolean(selectedPlanId) && !editor }
  );
  const copySourceQuery = useQuery<LessonPlan>(
    ["lessonPlan", copySourceId],
    () => api.lessonPlan(copySourceId),
    { enabled: copyDialogOpen && Boolean(copySourceId) }
  );

  const showNotice = (message: string, type: Notice["type"] = "success") =>
    setNotice({ id: Date.now(), message, type });

  const saveMutation = useMutation<LessonPlan, unknown, EditorDraft>(
    (draft) => {
      const input: LessonPlanInput = {
        year: draft.year,
        term: draft.term,
        locationId: draft.locationId,
        programName: draft.programName,
        sectionName: draft.sectionName,
        weeks: draft.weeks,
      };
      return draft.id && draft.revision
        ? api.updateLessonPlan({
            ...input,
            id: draft.id,
            expectedRevision: draft.revision,
          })
        : api.createLessonPlan(input);
    },
    {
      onSuccess: async (saved) => {
        queryClient.setQueryData(["lessonPlan", saved.id], saved);
        await queryClient.invalidateQueries("lessonPlans");
        setYear(saved.year);
        setTerm(saved.term);
        setLocationId(saved.locationId);
        setProgramName(saved.programName);
        setSelectedPlanId(saved.id);
        setEditor(undefined);
        showNotice("강의계획서를 저장했습니다.");
      },
      onError: (error: unknown) =>
        showNotice(
          error instanceof Error
            ? error.message
            : "강의계획서를 저장하지 못했습니다.",
          "error"
        ),
    }
  );

  const startNew = () => {
    setEditor({
      kind: "new",
      year,
      term: term || "spring",
      locationId: activeLocations[0]?.id || "",
      programName: programName || "오감별",
      sectionName: "",
      weeks: createEmptyWeeks(),
    });
  };

  const startEdit = () => {
    if (!detailQuery.data) return;
    setEditor({
      kind: "edit",
      id: detailQuery.data.id,
      revision: detailQuery.data.revision,
      year: detailQuery.data.year,
      term: detailQuery.data.term,
      locationId: detailQuery.data.locationId,
      programName: detailQuery.data.programName,
      sectionName: detailQuery.data.sectionName,
      weeks: detailQuery.data.weeks.map((week) => ({ ...week })),
    });
  };

  const startFullCopy = () => {
    if (!detailQuery.data) return;
    setEditor({
      kind: "copy",
      year: currentYear,
      term: detailQuery.data.term,
      locationId: detailQuery.data.locationId,
      programName: detailQuery.data.programName,
      sectionName: detailQuery.data.sectionName,
      weeks: detailQuery.data.weeks.map((week) => ({ ...week })),
    });
  };

  const cancelEditor = () => {
    if (window.confirm("저장하지 않은 편집 내용을 취소할까요?")) {
      setEditor(undefined);
    }
  };

  const updateWeek = (weekNumber: number, changes: Partial<LessonWeek>) => {
    setEditor((current) =>
      current
        ? {
            ...current,
            weeks: current.weeks.map((week) =>
              week.week === weekNumber ? { ...week, ...changes } : week
            ),
          }
        : current
    );
  };

  const openWeekCopy = () => {
    setCopySourceId(plans.find((plan) => plan.id !== editor?.id)?.id || "");
    setWeekMappings([]);
    setCopyDialogOpen(true);
  };

  const toggleSourceWeek = (sourceWeek: number, checked: boolean) => {
    setWeekMappings((current) =>
      checked
        ? [...current, { sourceWeek, targetWeek: sourceWeek }]
        : current.filter((mapping) => mapping.sourceWeek !== sourceWeek)
    );
  };

  const applyWeekCopy = () => {
    if (!editor || !copySourceQuery.data || weekMappings.length === 0) {
      showNotice("복사할 주차를 선택하세요.", "error");
      return;
    }
    const targets = weekMappings.map((mapping) => mapping.targetWeek);
    if (new Set(targets).size !== targets.length) {
      showNotice("대상 주차는 중복해서 선택할 수 없습니다.", "error");
      return;
    }
    const overwritten = targets.filter((target) => {
      const week = editor.weeks.find((item) => item.week === target);
      return Boolean(week?.className.trim() || week?.content.trim());
    });
    if (
      overwritten.length > 0 &&
      !window.confirm(
        `${overwritten
          .map((week) => `${week}주차`)
          .join(", ")}의 기존 내용을 덮어쓸까요?`
      )
    ) {
      return;
    }
    const sourceWeeks = new Map(
      copySourceQuery.data.weeks.map((week) => [week.week, week])
    );
    const mappingByTarget = new Map(
      weekMappings.map((mapping) => [mapping.targetWeek, mapping.sourceWeek])
    );
    setEditor({
      ...editor,
      weeks: editor.weeks.map((target) => {
        const sourceWeekNumber = mappingByTarget.get(target.week);
        const source = sourceWeekNumber
          ? sourceWeeks.get(sourceWeekNumber)
          : undefined;
        return source
          ? {
              week: target.week,
              className: source.className,
              content: source.content,
            }
          : target;
      }),
    });
    setCopyDialogOpen(false);
    showNotice(`${weekMappings.length}개 주차를 편집기에 가져왔습니다.`);
  };

  const editorLocationOptions = useMemo(() => {
    if (!editor) return activeLocations;
    const current = locations.find(
      (location) => location.id === editor.locationId
    );
    return current && !current.active
      ? [current, ...activeLocations]
      : activeLocations;
  }, [activeLocations, editor, locations]);

  const selectedDetail = detailQuery.data;
  const editorCompleted = editor ? completedWeekCount(editor.weeks) : 0;

  return (
    <main className="app-shell lesson-shell">
      <AppNavigation />

      <header className="lesson-hero">
        <div className="lesson-hero-mark" aria-hidden="true">
          12
        </div>
        <div>
          <span className="eyebrow">SEASONAL COURSE LEDGER</span>
          <h1>강의계획서</h1>
          <p>장소마다 사계절 12주 수업의 흐름을 기록합니다.</p>
        </div>
        <div className="annual-meter">
          <strong>48</strong>
          <span>주 / 연간 과정</span>
        </div>
      </header>

      <section className="lesson-toolbar" aria-label="강의계획서 검색 조건">
        <label>
          <span>연도</span>
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {years.map((availableYear) => (
              <option key={availableYear} value={availableYear}>
                {availableYear}년
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>학기</span>
          <select
            value={term}
            onChange={(event) => setTerm(event.target.value as LessonTerm | "")}
          >
            <option value="">전체 학기</option>
            {TERMS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>장소</span>
          <select
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">전체 장소</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
                {location.active ? "" : " (사용 중지)"}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>프로그램</span>
          <select
            aria-label="프로그램 검색"
            value={programName}
            onChange={(event) => setProgramName(event.target.value)}
          >
            <option value="">전체 프로그램</option>
            {programNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="lesson-toolbar-actions">
          <button
            className="button secondary"
            type="button"
            onClick={() => setLocationDialogOpen(true)}
          >
            <FiSettings /> 장소 관리
          </button>
          <button
            className="button accent"
            type="button"
            onClick={startNew}
            disabled={activeLocations.length === 0}
          >
            <FiPlus /> 신규 등록
          </button>
        </div>
      </section>

      <div className="lesson-workspace">
        <aside className="plan-browser" aria-label="강의계획서 목록">
          <div className="plan-browser-heading">
            <span>등록된 계획서</span>
            <strong>{filteredPlans.length}</strong>
          </div>
          <div className="plan-card-list">
            {filteredPlans.map((plan) => (
              <button
                type="button"
                key={plan.id}
                className={`plan-card ${
                  selectedPlanId === plan.id && !editor ? "active" : ""
                }`}
                onClick={() => {
                  setEditor(undefined);
                  setSelectedPlanId(plan.id);
                }}
              >
                <span
                  className={`term-swatch ${plan.term}`}
                  aria-hidden="true"
                />
                <span className="plan-card-main">
                  <b>{TERM_LABELS[plan.term]}</b>
                  <span>{plan.programName}</span>
                  <span>
                    <FiMapPin /> {plan.locationName}
                    {plan.sectionName ? ` · ${plan.sectionName}` : ""}
                  </span>
                </span>
                <span className={`completion-badge ${plan.status}`}>
                  {plan.status === "complete" ? <FiCheck /> : null}
                  {plan.completedWeeks}/12
                </span>
              </button>
            ))}
            {!plansQuery.isLoading && filteredPlans.length === 0 ? (
              <div className="empty-state small">
                <FiBookOpen />
                <strong>조건에 맞는 계획서가 없습니다.</strong>
                <span>신규 등록으로 첫 12주 과정을 만드세요.</span>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="plan-sheet" aria-label="강의계획서 상세">
          {editor ? (
            <form
              className="plan-editor"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                saveMutation.mutate(editor);
              }}
            >
              <header className="sheet-heading editor-heading">
                <div>
                  <span className="eyebrow">
                    {editor.kind === "edit"
                      ? "EDIT COURSE"
                      : editor.kind === "copy"
                      ? "COPY COURSE"
                      : "NEW COURSE"}
                  </span>
                  <h2>
                    {editor.kind === "edit"
                      ? "계획서 수정"
                      : editor.kind === "copy"
                      ? "전체 복사본 등록"
                      : "새 강의계획서"}
                  </h2>
                </div>
                <div
                  className={`editor-progress ${
                    editorCompleted === 12 ? "complete" : ""
                  }`}
                >
                  <strong>{editorCompleted}</strong>
                  <span>/ 12주 작성</span>
                </div>
              </header>

              {editor.kind === "copy" ? (
                <p className="copy-guidance">
                  복사할 대상의 연도·학기·장소·프로그램·수업 구분을 바꾸고
                  내용을 수정한 뒤 저장하세요.
                </p>
              ) : null}

              <div className="editor-meta">
                <label>
                  <span>연도</span>
                  <input
                    aria-label="계획서 연도"
                    type="number"
                    min="2000"
                    max="9999"
                    value={editor.year}
                    onChange={(event) =>
                      setEditor({ ...editor, year: Number(event.target.value) })
                    }
                  />
                </label>
                <label>
                  <span>학기</span>
                  <select
                    aria-label="계획서 학기"
                    value={editor.term}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        term: event.target.value as LessonTerm,
                      })
                    }
                  >
                    {TERMS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>장소</span>
                  <select
                    aria-label="계획서 장소"
                    value={editor.locationId}
                    onChange={(event) =>
                      setEditor({ ...editor, locationId: event.target.value })
                    }
                    required
                  >
                    <option value="">장소 선택</option>
                    {editorLocationOptions.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                        {location.active ? "" : " (사용 중지)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>프로그램명</span>
                  <input
                    aria-label="계획서 프로그램명"
                    value={editor.programName}
                    onChange={(event) =>
                      setEditor({ ...editor, programName: event.target.value })
                    }
                    placeholder="예: 오감별"
                    required
                  />
                </label>
                <label>
                  <span>수업 구분</span>
                  <input
                    aria-label="계획서 수업 구분"
                    value={editor.sectionName}
                    onChange={(event) =>
                      setEditor({ ...editor, sectionName: event.target.value })
                    }
                    placeholder="예: 월요일, 8주"
                  />
                </label>
                <button
                  className="button secondary copy-weeks-button"
                  type="button"
                  onClick={openWeekCopy}
                  disabled={plans.length === 0}
                >
                  <FiClipboard /> 주차 가져오기
                </button>
              </div>

              <div className="week-grid week-grid-header" aria-hidden="true">
                <span>주차</span>
                <span>수업명</span>
                <span>수업내용</span>
              </div>
              <div className="week-editor-list">
                {editor.weeks.map((week) => (
                  <div className="week-grid week-editor-row" key={week.week}>
                    <div className="week-number">
                      <b>{String(week.week).padStart(2, "0")}</b>
                      <span>주차</span>
                    </div>
                    <label>
                      <span className="mobile-field-label">수업명</span>
                      <input
                        aria-label={`${week.week}주차 수업명`}
                        value={week.className}
                        onChange={(event) =>
                          updateWeek(week.week, {
                            className: event.target.value,
                          })
                        }
                        placeholder="수업명을 입력하세요"
                      />
                    </label>
                    <label>
                      <span className="mobile-field-label">수업내용</span>
                      <textarea
                        aria-label={`${week.week}주차 수업내용`}
                        value={week.content}
                        onChange={(event) =>
                          updateWeek(week.week, { content: event.target.value })
                        }
                        placeholder="수업내용을 입력하세요"
                        rows={2}
                      />
                    </label>
                  </div>
                ))}
              </div>
              <footer className="sheet-actions">
                <button
                  className="button ghost"
                  type="button"
                  onClick={cancelEditor}
                >
                  취소
                </button>
                <button
                  className="button accent"
                  type="submit"
                  disabled={saveMutation.isLoading || !editor.locationId}
                >
                  <FiSave />{" "}
                  {saveMutation.isLoading ? "저장 중..." : "임시저장"}
                </button>
              </footer>
            </form>
          ) : selectedDetail ? (
            <article className="plan-detail">
              <header className="sheet-heading">
                <div>
                  <span className="eyebrow">
                    {selectedDetail.year} COURSE RECORD
                  </span>
                  <h2>
                    {TERM_LABELS[selectedDetail.term]} ·{" "}
                    {selectedDetail.locationName}
                  </h2>
                  <p>
                    {selectedDetail.programName}
                    {selectedDetail.sectionName
                      ? ` · ${selectedDetail.sectionName}`
                      : ""}
                    {" · "}
                    마지막 수정{" "}
                    {new Date(selectedDetail.updatedAt).toLocaleString("ko-KR")}
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={startFullCopy}
                  >
                    <FiCopy /> 전체 복사
                  </button>
                  <button
                    className="button accent"
                    type="button"
                    onClick={startEdit}
                  >
                    <FiEdit2 /> 수정
                  </button>
                </div>
              </header>
              <div className="detail-status-line">
                <span className={`completion-badge ${selectedDetail.status}`}>
                  {selectedDetail.status === "complete" ? "완료" : "작성중"}{" "}
                  {selectedDetail.completedWeeks}/12
                </span>
                {!selectedDetail.locationActive ? (
                  <span className="inactive-note">사용 중지된 장소</span>
                ) : null}
              </div>
              <div className="week-grid week-grid-header" aria-hidden="true">
                <span>주차</span>
                <span>수업명</span>
                <span>수업내용</span>
              </div>
              <div className="week-detail-list">
                {selectedDetail.weeks.map((week) => (
                  <div className="week-grid week-detail-row" key={week.week}>
                    <div className="week-number">
                      <b>{String(week.week).padStart(2, "0")}</b>
                      <span>주차</span>
                    </div>
                    <div>
                      <span className="mobile-field-label">수업명</span>
                      <strong>{week.className || "미작성"}</strong>
                    </div>
                    <div>
                      <span className="mobile-field-label">수업내용</span>
                      <p>{week.content || "미작성"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : detailQuery.isLoading ? (
            <div className="loading-state">강의계획서를 불러오는 중...</div>
          ) : (
            <div className="empty-state">
              <FiBookOpen />
              <strong>확인할 강의계획서를 선택하세요.</strong>
              <span>
                장소를 먼저 등록한 뒤 새로운 계획서를 만들 수 있습니다.
              </span>
            </div>
          )}
        </section>
      </div>

      <div
        className={`status-message ${notice ? "visible" : ""} ${
          notice?.type || ""
        }`}
        role={notice?.type === "error" ? "alert" : "status"}
        aria-live={notice?.type === "error" ? "assertive" : "polite"}
      >
        <span>{notice?.message}</span>
        {notice ? (
          <button
            type="button"
            className="notice-close"
            aria-label="알림 닫기"
            onClick={() => setNotice(undefined)}
          >
            <FiX />
          </button>
        ) : null}
      </div>

      {locationDialogOpen ? (
        <LessonLocationDialog
          locations={locations}
          onClose={() => setLocationDialogOpen(false)}
          onNotice={showNotice}
        />
      ) : null}

      {copyDialogOpen && editor ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="dialog-card week-copy-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="week-copy-title"
          >
            <header className="dialog-heading">
              <div>
                <span className="eyebrow">IMPORT WEEKS</span>
                <h2 id="week-copy-title">특정 주차 가져오기</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="주차 가져오기 닫기"
                onClick={() => setCopyDialogOpen(false)}
              >
                <FiX />
              </button>
            </header>
            <label className="copy-source-select">
              <span>원본 계획서</span>
              <select
                value={copySourceId}
                onChange={(event) => {
                  setCopySourceId(event.target.value);
                  setWeekMappings([]);
                }}
              >
                <option value="">원본 선택</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.year}년 {TERM_LABELS[plan.term]} · {plan.programName}{" "}
                    · {plan.locationName}
                    {plan.sectionName ? ` · ${plan.sectionName}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="copy-week-list">
              {copySourceQuery.data?.weeks.map((week) => {
                const mapping = weekMappings.find(
                  (item) => item.sourceWeek === week.week
                );
                return (
                  <div
                    className={`copy-week-row ${mapping ? "selected" : ""}`}
                    key={week.week}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(mapping)}
                        onChange={(event) =>
                          toggleSourceWeek(week.week, event.target.checked)
                        }
                      />
                      <b>{week.week}주차</b>
                      <span>{week.className || "미작성"}</span>
                    </label>
                    <select
                      aria-label={`${week.week}주차 대상 주차`}
                      value={mapping?.targetWeek || week.week}
                      disabled={!mapping}
                      onChange={(event) =>
                        setWeekMappings((current) =>
                          current.map((item) =>
                            item.sourceWeek === week.week
                              ? {
                                  ...item,
                                  targetWeek: Number(event.target.value),
                                }
                              : item
                          )
                        )
                      }
                    >
                      {createEmptyWeeks().map((target) => (
                        <option key={target.week} value={target.week}>
                          → {target.week}주차
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
              {copySourceId && copySourceQuery.isLoading ? (
                <div className="loading-state">원본을 불러오는 중...</div>
              ) : null}
            </div>
            <div className="dialog-actions">
              <button
                className="button ghost"
                type="button"
                onClick={() => setCopyDialogOpen(false)}
              >
                취소
              </button>
              <button
                className="button accent"
                type="button"
                onClick={applyWeekCopy}
                disabled={weekMappings.length === 0}
              >
                선택 주차 가져오기
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default LessonPlans;
