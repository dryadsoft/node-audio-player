import InkConflictPreview from "../components/InkConflictPreview";
import { usePwaUpdateGuard } from "../offline/updateGuard";
import { useEffect, useMemo, useRef, useState } from "react";
import { InkCanvas, InkNoteBackground } from "@dryadsoft/react-ink-canvas";
import { Link } from "react-router-dom";
import { attendanceApi, AttendanceError } from "../attendance/api";
import { useDialogFocus } from "../attendance/useDialogFocus";
import { useAttendance } from "../attendance/workspace";
import {
  PageMeta,
  pageReady,
  Period,
  Term,
  termKey,
  terms,
  isPeriodDeleted,
} from "../attendance/types";
import PhotoImport from "../attendance/PhotoImport";
import { LessonTerm } from "../types";
import { pwaState, subscribePwa } from "../offline/pwa";
import "../attendance/attendance.css";
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
export default function Attendance() {
  const state = useAttendance(),
    { workspace } = state;
  const [view, setView] = useState<Term>({
      year: new Date().getFullYear(),
      term: "fall",
    }),
    [centerId, setCenterId] = useState(""),
    [periodId, setPeriodId] = useState(""),
    [pageId, setPageId] = useState("");
  const [panel, setPanel] = useState(false),
    [addMenu, setAddMenu] = useState(false),
    [details, setDetails] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [touchDraw, setTouchDraw] = useState(false),
    [trash, setTrash] = useState(false),
    [file, setFile] = useState<File>(),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [photo, setPhoto] = useState("");
  const [locationId, setLocationId] = useState(""),
    [weekday, setWeekday] = useState(1),
    [periodName, setPeriodName] = useState(""),
    [pwa, setPwa] = useState(pwaState);
  const [interacting, setInteracting] = useState(false);
  usePwaUpdateGuard(interacting || file || working || panel
    ? "필기·사진 가져오기·관리 입력을 마치거나 닫은 뒤 적용해 주세요." : "");
  const chosenInitial = useRef(false),
    camera = useRef<HTMLInputElement>(null),
    picker = useRef<HTMLInputElement>(null);
  useEffect(() => subscribePwa(() => setPwa(pwaState())), []);
  useEffect(() => {
    if (state.hydrated && !chosenInitial.current) {
      chosenInitial.current = true;
      if (state.target) setView(state.target);
      else setPanel(true);
    }
  }, [state.hydrated, state.target]);
  useEffect(() => {
    workspace.setView(view);
  }, [workspace, view]);
  useDialogFocus(panel);
  const [yearInput, setYearInput] = useState(String(view.year));
  useEffect(() => setYearInput(String(view.year)), [view.year]);
  const catalog = state.catalogs.find(
    (c) => termKey(c.semester) === termKey(view)
  );
  const centers = useMemo(
      () => catalog?.centers.filter((c) => trash || !c.deletedAt) || [],
      [catalog, trash]
    ),
    center = centers.find((c) => c.id === centerId);
  const periods = useMemo(
    () =>
      catalog?.periods
        .filter((p) => p.centerId === centerId && (trash || !p.deletedAt))
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)) ||
      [],
    [catalog, centerId, trash]
  );
  const period = periods.find((p) => p.id === periodId);
  useEffect(() => {
    if (!centers.some((c) => c.id === centerId))
      setCenterId(centers[0]?.id || "");
  }, [centers, centerId]);
  useEffect(() => {
    if (!periods.some((p) => p.id === periodId))
      setPeriodId(periods[0]?.id || "");
  }, [periods, periodId]);
  const pages = useMemo(() => {
    const map = new Map<string, PageMeta>();
    catalog?.pages
      .filter((p) => p.periodId === periodId)
      .forEach((p) => map.set(p.id, p));
    state.pages
      .filter((p) => p.local.periodId === periodId)
      .forEach((p) => {
        const remote = map.get(p.id);
        map.set(
          p.id,
          remote && remote.revision > p.local.revision ? remote : p.local
        );
      });
    return Array.from(map.values())
      .filter((p) => trash || !p.deletedAt)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }, [catalog, periodId, state.pages, trash]);
  useEffect(() => {
    if (!pages.some((p) => p.id === pageId)) setPageId(pages[0]?.id || "");
  }, [pages, pageId]);
  const record = state.pages.find((p) => p.id === pageId),
    ready = record?.photoReady,
    isNote = record?.local.pageType === "note",
    readOnly = !!(
      record?.local.deletedAt ||
      record?.remoteDeleted ||
      isPeriodDeleted(catalog, periodId)
    ),
    pageIndex = pages.findIndex((p) => p.id === pageId);
  useEffect(() => {
    if (pageId) workspace.want(pageId);
  }, [workspace, pageId]);
  useEffect(() => {
    setPhoto("");
    if (!pageId || !ready || isNote) return;
    let live = true,
      url = "";
    void workspace.store
      .photo(pageId)
      .then((blob) => {
        if (blob && live) {
          url = URL.createObjectURL(blob);
          setPhoto(url);
        }
      })
      .catch(() => setError("기기 사진을 읽지 못했습니다. 다시 시도하세요."));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [workspace, pageId, ready, isNote]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (file || working) return;
        setFullscreen(false);
        setPanel(false);
        setAddMenu(false);
        setDetails(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [file, working]);
  const targetCatalog = state.catalogs.find(
    (c) => state.target && termKey(c.semester) === termKey(state.target)
  );
  const targetPages =
    targetCatalog?.pages.filter(
      (p) => !p.deletedAt && !isPeriodDeleted(targetCatalog, p.periodId)
    ) || [];
  const downloaded = targetPages.filter((p) =>
    state.pages.some((r) => r.id === p.id && pageReady(r) && r.base)
  ).length;
  const offlineReady =
    !!targetCatalog &&
    downloaded === targetPages.length &&
    ["ready", "update"].includes(pwa);
  const pending = state.pages.filter((p) => p.dirty).length;
  const duplicateCenter = catalog?.centers.find(
    (c) => c.locationId === locationId && c.weekday === weekday
  );
  const centerHasPending =
    !!state.unsaved ||
    state.pages.some(
      (p) =>
        p.dirty &&
        catalog?.periods.some(
          (period) =>
            period.id === p.local.periodId && period.centerId === centerId
        )
    );
  const run = async (action: () => Promise<unknown>) => {
    if (!state.online) {
      setError("이 관리는 온라인에서 사용할 수 있습니다.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      await action();
      await workspace.refresh();
    } catch (e) {
      if (e instanceof AttendanceError && e.status === 409)
        await workspace.refresh().catch(() => undefined);
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setWorking(false);
    }
  };
  const addNote = async () => {
    if (working || !period || isPeriodDeleted(catalog, periodId)) return;
    setWorking(true);
    setError("");
    setAddMenu(false);
    try {
      const id = await workspace.addNote(view, periodId);
      setPageId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "노트를 추가하지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };
  const chooseFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0];
    e.target.value = "";
    setAddMenu(false);
    if (next) setFile(next);
  };
  const reorder = async <
    T extends { id: string; position: number; revision: number }
  >(
    list: T[],
    index: number,
    delta: number,
    save: (item: T, position: number) => Promise<unknown>
  ) => {
    const other = index + delta;
    if (other < 0 || other >= list.length) return;
    const copy = [...list];
    [copy[index], copy[other]] = [copy[other], copy[index]];
    for (let i = 0; i < copy.length; i++)
      if (copy[i].position !== i) await save(copy[i], i);
  };
  const centerName =
    catalog?.locations.find((l) => l.id === center?.locationId)?.name ||
    "센터 선택";
  return (
    <main
      className={`attendance-screen ${
        fullscreen ? "attendance-fullscreen" : ""
      }`}
    >
      <header className="attendance-header">
        <Link to="/" aria-label="음악 화면으로">
          ←
        </Link>
        <button className="attendance-context" onClick={() => setPanel(true)}>
          <small>
            {view.year} {terms[view.term]}
          </small>
          <strong>
            {centerName}
            {center ? ` · ${weekdays[center.weekday]}` : ""} /{" "}
            {period?.name || "교시 선택"} ▾
          </strong>
        </button>
        <div className="attendance-page-control">
          <button
            aria-label="이전 페이지"
            disabled={pageIndex <= 0}
            onClick={() => setPageId(pages[pageIndex - 1].id)}
          >
            ‹
          </button>
          <button onClick={() => setPanel(true)}>
            {pages.length
              ? `${pageIndex + 1} / ${pages.length}`
              : "페이지 없음"}
          </button>
          <button
            aria-label="다음 페이지"
            disabled={pageIndex < 0 || pageIndex >= pages.length - 1}
            onClick={() => setPageId(pages[pageIndex + 1].id)}
          >
            ›
          </button>
        </div>
        <button
          disabled={!period || isPeriodDeleted(catalog, periodId)}
          onClick={() => setAddMenu(!addMenu)}
          aria-label="페이지 추가"
        >
          ＋
        </button>
        <button
          onClick={() => setFullscreen(!fullscreen)}
          aria-label={fullscreen ? "전체화면 닫기" : "전체화면 열기"}
        >
          {fullscreen ? "축소" : "전체화면"}
        </button>
        <button
          className="attendance-status"
          onClick={() => setDetails(!details)}
          aria-label="저장 상태 상세"
        >
          {state.storageError || state.unsaved
            ? "저장 확인"
            : state.auth
            ? "로그인 필요"
            : pending
            ? `전송 대기 ${pending}`
            : offlineReady
            ? "오프라인 준비됨"
            : state.busy
            ? "준비 중"
            : "저장 상태"}
        </button>
      </header>
      {addMenu && period && !isPeriodDeleted(catalog, periodId) && (
        <div className="attendance-add-menu">
          <button disabled={working} onClick={() => void addNote()}>
            줄노트 추가
          </button>
          <button onClick={() => camera.current?.click()}>카메라로 촬영</button>
          <button onClick={() => picker.current?.click()}>
            사진·파일 가져오기
          </button>
        </div>
      )}
      <input
        ref={camera}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={chooseFile}
      />
      <input
        ref={picker}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={chooseFile}
      />
      {details && (
        <section className="attendance-status-panel">
          <button className="close" onClick={() => setDetails(false)}>
            닫기
          </button>
          <strong>
            {state.online ? "온라인" : "오프라인"} · {downloaded}/
            {targetPages.length}장 준비
          </strong>
          <p>
            {state.unsaved
              ? "기기 저장 중이거나 저장하지 못한 입력이 있습니다."
              : pending
              ? "기기에 저장됨 · 동기화 대기"
              : "기기에 저장된 기록을 사용할 수 있습니다."}
          </p>
          {state.lastSync && (
            <p>
              마지막 서버 확인{" "}
              {new Date(state.lastSync).toLocaleString("ko-KR")}
            </p>
          )}
          <p role="status">{state.storageError || state.error}</p>
          <button onClick={() => void workspace.retry()}>다시 시도</button>
          {state.auth && (
            <button
              disabled={!!state.unsaved}
              onClick={() => window.location.assign("/attendance?reauth=1")}
            >
              다시 로그인
            </button>
          )}
          <p>
            앱을 열어 두면 전송합니다. 브라우저 데이터를 삭제하기 전에 동기화를
            완료하세요.
          </p>
        </section>
      )}
      {(error || state.storageError) && (
        <div className="attendance-error" role="alert">
          {error || state.storageError}
          <button
            onClick={() => {
              setError("");
              void workspace.retry();
            }}
          >
            다시 시도
          </button>
        </div>
      )}
      {record?.error && (
        <div className="attendance-error">
          {record.error}
          <button
            onClick={() => {
              setTrash(true);
              setPanel(true);
            }}
          >
            관리·복구
          </button>
        </div>
      )}
      <section className="attendance-workspace">
        {!period ? (
          <div className="attendance-empty">
            <strong>센터와 교시를 준비하세요</strong>
            <button className="primary" onClick={() => setPanel(true)}>
              출석부 관리
            </button>
          </div>
        ) : !pages.length ? (
          <div className="attendance-empty">
            <strong>{period.name} 출석부</strong>
            <p>줄노트를 추가하거나 사진을 가져와 바로 필기하세요.</p>
            <div>
              <button
                className="primary"
                disabled={working || isPeriodDeleted(catalog, periodId)}
                onClick={() => void addNote()}
              >
                줄노트 추가
              </button>
              <button
                disabled={isPeriodDeleted(catalog, periodId)}
                onClick={() => camera.current?.click()}
              >
                촬영하기
              </button>
              <button
                disabled={isPeriodDeleted(catalog, periodId)}
                onClick={() => picker.current?.click()}
              >
                가져오기
              </button>
            </div>
          </div>
        ) : !record || (!isNote && !photo) ? (
          <div className="attendance-empty">
            <p>
              {state.online
                ? "페이지를 준비하고 있습니다."
                : "아직 이 페이지가 기기에 저장되지 않았습니다."}
            </p>
            <button onClick={() => void workspace.retry()}>다시 시도</button>
          </div>
        ) : (
          <>
            {readOnly ? (
              <div className="attendance-recovery">
                <p>휴지통 기록입니다. 복구하면 계속 필기할 수 있습니다.</p>
                <div
                  style={{
                    position: "relative",
                    aspectRatio: String(
                      record.local.width / record.local.height
                    ),
                  }}
                >
                  {isNote ? (
                    <InkNoteBackground
                      aspectRatio={record.local.inkDocument.aspectRatio}
                    />
                  ) : (
                    <img src={photo} alt="복구할 출석부" />
                  )}
                  <svg viewBox="0 0 1 1" preserveAspectRatio="none">
                    {record.local.inkDocument.strokes.map((s) => (
                      <polyline
                        key={s.id}
                        points={s.points
                          .map((p) => `${p[0]},${p[1]}`)
                          .join(" ")}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={s.width / 1000}
                      />
                    ))}
                  </svg>
                </div>
              </div>
            ) : (
              <>
                <div className="attendance-touch">
                  <button
                    aria-pressed={touchDraw}
                    onClick={() => setTouchDraw(!touchDraw)}
                  >
                    {touchDraw ? "손가락 필기" : "손가락 이동"} · 전환
                  </button>
                </div>
                <InkCanvas
                  key={pageId}
                  document={record.local.inkDocument}
                  mode={isNote ? "note" : "drawing"}
                  backgroundImage={isNote ? undefined : photo}
                  fixedPage
                  compactTools
                  inkLimits={{ maxBytes: 1024 * 1024 }}
                  touchBehavior={touchDraw ? "draw" : "pan-zoom"}
                  className="attendance-ink"
                  historyResetKey={record.historyKey || 0}
                  onInteractionChange={setInteracting}
                  onChange={(ink) => workspace.edit(pageId, ink)}
                  labels={{
                    clearConfirm: isNote
                      ? "이 노트의 필기를 모두 지울까요?"
                      : "이 사진 위의 필기를 모두 지울까요?",
                    canvas: isNote
                      ? "출석부 줄노트 필기"
                      : "출석부 사진 위 필기",
                  }}
                />
              </>
            )}
            {!!record.conflicts.length && (
              <section
                className="attendance-conflicts"
                aria-label="필기 충돌 해결"
              >
                <strong>같은 필기가 다른 기기에서 수정됐습니다.</strong>
                {record.conflicts.map((c) => (
                  <div key={c.id}>
                    <span>필기 획</span>
                    {(["local", "server"] as const).map((side) => (
                      <button
                        disabled={!!state.unsaved}
                        key={side}
                        onClick={() =>
                          void workspace.resolve(pageId, c.id, side)
                        }
                      >
                        {side === "local" ? "이 기기" : "서버"}
                        <InkConflictPreview value={c[side]} />
                      </button>
                    ))}
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </section>
      {panel && (
        <div className="attendance-overlay" onClick={() => setPanel(false)}>
          <aside
            className="attendance-manager"
            role="dialog"
            aria-modal="true"
            aria-label="출석부 관리"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <strong>출석부 관리</strong>
              <button onClick={() => setPanel(false)}>닫기</button>
            </header>
            <section>
              <h2>학기</h2>
              <div className="attendance-fields">
                <label>
                  연도
                  <input
                    type="number"
                    min="2000"
                    max="9999"
                    value={yearInput}
                    onChange={(e) => {
                      setYearInput(e.target.value);
                      const year = Number(e.target.value);
                      if (
                        /^\d{4}$/.test(e.target.value) &&
                        year >= 2000 &&
                        year <= 9999
                      )
                        setView({ ...view, year });
                    }}
                  />
                </label>
                <label>
                  학기
                  <select
                    value={view.term}
                    onChange={(e) =>
                      setView({ ...view, term: e.target.value as LessonTerm })
                    }
                  >
                    {Object.entries(terms).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="primary"
                onClick={() => void workspace.setTarget(view)}
              >
                {state.target && termKey(state.target) === termKey(view)
                  ? "이 학기 전체를 기기에 저장 중"
                  : "이 학기를 오프라인 저장 대상으로 지정"}
              </button>
            </section>
            <section>
              <h2>센터</h2>
              <label>
                <input
                  type="checkbox"
                  checked={trash}
                  onChange={(e) => setTrash(e.target.checked)}
                />{" "}
                휴지통 포함
              </label>
              <select
                aria-label="센터 선택"
                value={centerId}
                onChange={(e) => setCenterId(e.target.value)}
              >
                <option value="">센터 선택</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.deletedAt ? "휴지통 · " : ""}
                    {catalog?.locations.find((l) => l.id === c.locationId)
                      ?.name || c.locationId}{" "}
                    · {weekdays[c.weekday]}
                  </option>
                ))}
              </select>
              {center && (
                <label>
                  수업 요일
                  <select
                    disabled={!state.online || working || !!center.deletedAt}
                    value={center.weekday}
                    onChange={(e) => {
                      const day = Number(e.target.value);
                      void run(() =>
                        attendanceApi.center({
                          ...center,
                          weekday: day,
                          expectedRevision: center.revision,
                        })
                      );
                    }}
                  >
                    {weekdays.map((d, i) => (
                      <option key={d} value={i}>
                        {d}요일
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {center && (
                <>
                  <button
                    disabled={
                      !state.online ||
                      working ||
                      (!center.deletedAt && centerHasPending)
                    }
                    onClick={() => {
                      const deleting = !center.deletedAt;
                      if (
                        deleting &&
                        !window.confirm(
                          `${centerName} · ${
                            weekdays[center.weekday]
                          }요일 등록을 휴지통으로 옮길까요? 교시·사진·노트·필기는 보관되며 복구할 수 있습니다.`
                        )
                      )
                        return;
                      void run(async () => {
                        await attendanceApi.center({
                          ...center,
                          deleted: deleting,
                          expectedRevision: center.revision,
                        });
                        await workspace.refresh();
                        if (deleting) {
                          setTrash(false);
                          setCenterId(
                            centers.find(
                              (c) => c.id !== center.id && !c.deletedAt
                            )?.id || ""
                          );
                        }
                      });
                    }}
                  >
                    {center.deletedAt ? "센터 복구" : "센터 삭제"}
                  </button>
                  {!center.deletedAt && centerHasPending && (
                    <p>
                      미전송 페이지·필기와 기기 저장이 완료되면 센터를 삭제할 수
                      있습니다.
                    </p>
                  )}
                  {!!center.deletedAt && (
                    <p>
                      센터를 먼저 복구하면 교시·페이지를 다시 사용할 수
                      있습니다.
                    </p>
                  )}
                </>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (duplicateCenter) return;
                  void run(async () => {
                    const c = await attendanceApi.center({
                      ...view,
                      locationId,
                      weekday,
                    });
                    await workspace.refresh();
                    setCenterId(c.id);
                  });
                }}
              >
                <label>
                  이 학기에 센터 추가
                  <select
                    required
                    value={locationId}
                    disabled={!state.online || working}
                    onChange={(e) => setLocationId(e.target.value)}
                  >
                    <option value="">기존 센터 선택</option>
                    {catalog?.locations
                      .filter((l) => l.active)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  요일
                  <select
                    disabled={!state.online || working}
                    value={weekday}
                    onChange={(e) => setWeekday(Number(e.target.value))}
                  >
                    {weekdays.map((d, i) => (
                      <option key={d} value={i}>
                        {d}요일
                      </option>
                    ))}
                  </select>
                </label>
                {duplicateCenter && (
                  <p role="status">
                    {duplicateCenter.deletedAt
                      ? "휴지통에 같은 센터·요일이 있습니다. 휴지통 포함을 켜고 센터를 복구하세요."
                      : "이미 등록된 센터·요일입니다. 다른 요일을 선택하세요."}
                  </p>
                )}
                <button
                  disabled={
                    !state.online || !locationId || working || !!duplicateCenter
                  }
                >
                  센터 추가
                </button>
              </form>
            </section>
            <section>
              <h2>교시</h2>
              {periods.map((p, i) => (
                <div
                  className="attendance-manage-row"
                  key={`${p.id}:${p.revision}`}
                >
                  <button
                    className={p.id === periodId ? "selected" : ""}
                    onClick={() => setPeriodId(p.id)}
                  >
                    {p.deletedAt ? "휴지통 · " : ""}
                    {p.name}
                  </button>
                  <input
                    aria-label={`${p.name} 이름`}
                    defaultValue={p.name}
                    maxLength={100}
                    disabled={!state.online || working || !!center?.deletedAt}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== p.name)
                        void run(() =>
                          attendanceApi.period(p.id, {
                            name: e.target.value,
                            expectedRevision: p.revision,
                          })
                        );
                    }}
                  />
                  <button
                    aria-label={`${p.name} 위로`}
                    disabled={
                      i === 0 || !state.online || working || !!center?.deletedAt
                    }
                    onClick={() =>
                      void run(() =>
                        reorder<Period>(periods, i, -1, (item, position) =>
                          attendanceApi.period(item.id, {
                            position,
                            expectedRevision: item.revision,
                          })
                        )
                      )
                    }
                  >
                    ↑
                  </button>
                  <button
                    disabled={!state.online || working || !!center?.deletedAt}
                    onClick={() =>
                      void run(() =>
                        attendanceApi.period(p.id, {
                          deleted: !p.deletedAt,
                          expectedRevision: p.revision,
                        })
                      )
                    }
                  >
                    {p.deletedAt ? "복구" : "휴지통"}
                  </button>
                </div>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const p = await attendanceApi.createPeriod(
                      centerId,
                      periodName
                    );
                    await workspace.refresh();
                    setPeriodId(p.id);
                    setPeriodName("");
                  });
                }}
              >
                <input
                  aria-label="새 교시 이름"
                  placeholder="예: 1교시, 유아반"
                  maxLength={100}
                  required
                  value={periodName}
                  onChange={(e) => setPeriodName(e.target.value)}
                />
                <button
                  disabled={
                    !center ||
                    !!center.deletedAt ||
                    !state.online ||
                    working ||
                    !periodName.trim()
                  }
                >
                  교시 추가
                </button>
              </form>
            </section>
            <section>
              <h2>페이지 · {period?.name || "교시를 선택하세요"}</h2>
              {pages.map((p, i) => (
                <div className="attendance-manage-row" key={p.id}>
                  <button
                    className={pageId === p.id ? "selected" : ""}
                    onClick={() => {
                      setPageId(p.id);
                      setPanel(false);
                    }}
                  >
                    {p.deletedAt ? "휴지통 · " : ""}
                    {i + 1}페이지 · {p.pageType === "note" ? "줄노트" : "사진"}
                  </button>
                  <button
                    aria-label={`${i + 1}페이지 위로`}
                    disabled={
                      !state.online ||
                      working ||
                      isPeriodDeleted(catalog, periodId) ||
                      i === 0 ||
                      !p.revision
                    }
                    onClick={() =>
                      void run(() =>
                        reorder(pages, i, -1, (item, position) =>
                          attendanceApi.changePage(item.id, {
                            position,
                            expectedRevision: item.revision,
                          })
                        )
                      )
                    }
                  >
                    ↑
                  </button>
                  <button
                    disabled={
                      !state.online ||
                      working ||
                      isPeriodDeleted(catalog, periodId) ||
                      !p.revision ||
                      (!p.deletedAt &&
                        state.pages.some((r) => r.id === p.id && r.dirty))
                    }
                    onClick={() =>
                      void run(() =>
                        attendanceApi.changePage(p.id, {
                          deleted: !p.deletedAt,
                          expectedRevision: p.revision,
                        })
                      )
                    }
                  >
                    {p.deletedAt ? "복구" : "휴지통"}
                  </button>
                </div>
              ))}
            </section>
            {!state.online && (
              <p>
                센터·교시 관리와 휴지통 복구는 온라인에서 사용할 수 있습니다.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </aside>
        </div>
      )}
      {file && period && !isPeriodDeleted(catalog, periodId) && (
        <PhotoImport
          file={file}
          onClose={() => setFile(undefined)}
          onSave={async (blob, width, height) => {
            const id = await workspace.add(
              view,
              period.id,
              blob,
              width,
              height
            );
            setPageId(id);
            setFile(undefined);
          }}
        />
      )}
    </main>
  );
}
