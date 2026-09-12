import { useEffect, useMemo, useState } from "react";
import { attendanceApi, AttendanceError } from "./api";
import { useAttendance } from "./workspace";
import {
  PageMeta,
  Period,
  Term,
  termKey,
  terms,
  isPeriodDeleted,
} from "./types";
import ManagementDialog from "../components/ManagementDialog";
import CenterManager from "../components/CenterManager";
import AttendancePagePreview from "./AttendancePagePreview";
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
export default function AttendanceManager({
  view,
  initialCenterId,
  initialPeriodId,
  initialPageId,
  recovery = false,
  onClose,
}: {
  view: Term;
  initialCenterId: string;
  initialPeriodId: string;
  initialPageId: string;
  recovery?: boolean;
  onClose: () => void;
}) {
  const state = useAttendance(),
    { workspace } = state;
  const [centerId, setCenterId] = useState(initialCenterId),
    [periodId, setPeriodId] = useState(initialPeriodId),
    [pageId, setPageId] = useState(initialPageId);
  const [trash, setTrash] = useState(recovery),
    [inactive, setInactive] = useState(false);
  const [locationId, setLocationId] = useState(""),
    [weekday, setWeekday] = useState(1),
    [periodName, setPeriodName] = useState("");
  const [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const [tab, setTab] = useState("centers"),
    [common, setCommon] = useState(false),
    [commonBusy, setCommonBusy] = useState(false),
    [preview, setPreview] = useState(false);
  const catalog = state.catalogs.find(
    (c) => termKey(c.semester) === termKey(view)
  );
  const centers = useMemo(
      () =>
        catalog?.centers.filter(
          (c) =>
            (trash || !c.deletedAt) &&
            (inactive ||
              catalog?.locations.find((l) => l.id === c.locationId)?.active !==
                false)
        ) || [],
      [catalog, trash, inactive]
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

  const centerInactive =
    catalog?.locations.find((l) => l.id === center?.locationId)?.active ===
    false;
  return (
    <ManagementDialog
      title="출석부 관리"
      busy={working || commonBusy}
      onClose={() => (common ? setCommon(false) : onClose())}
    >
      {common ? (
        <CenterManager
          onBack={() => setCommon(false)}
          onBusyChange={setCommonBusy}
        />
      ) : null}
      <div hidden={common} className="attendance-manager">
        <p>
          {view.year} {terms[view.term]}
        </p>
        <button disabled={working} onClick={() => setCommon(true)}>
          공통 센터 관리
        </button>
        <div className="management-tabs">
          {[
            ["centers", "센터·요일"],
            ["periods", "수업시간·교시"],
            ["pages", "페이지"],
          ].map(([key, label]) => (
            <button
              key={key}
              disabled={working}
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <fieldset disabled={working} style={{ border: 0, padding: 0 }}>
          <label>
            <input
              type="checkbox"
              checked={trash}
              onChange={(e) => setTrash(e.target.checked)}
            />{" "}
            휴지통 포함
          </label>
          <label>
            <input
              type="checkbox"
              checked={inactive}
              onChange={(e) => setInactive(e.target.checked)}
            />
            사용 중지 센터 포함
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
                {catalog?.locations.find((l) => l.id === c.locationId)?.name ||
                  c.locationId}{" "}
                · {weekdays[c.weekday]}
              </option>
            ))}
          </select>
          {tab === "pages" && (
            <label>
              관리할 수업
              <select
                value={periodId}
                onChange={(e) => {
                  setPeriodId(e.target.value);
                  setPreview(false);
                }}
              >
                <option value="">교시 선택</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.deletedAt ? "휴지통 · " : ""}
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <section hidden={tab !== "centers"}>
            <h2>센터·요일 등록</h2>
            {center && (
              <WeekdayEditor
                key={`${center.id}:${center.revision}`}
                value={center.weekday}
                disabled={!state.online || working || !!center.deletedAt}
                save={(weekday) =>
                  run(() =>
                    attendanceApi.center({
                      ...center,
                      weekday,
                      expectedRevision: center.revision,
                    })
                  )
                }
              />
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
                    센터를 먼저 복구하면 교시·페이지를 다시 사용할 수 있습니다.
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
          <section hidden={tab !== "periods"}>
            <h2>수업시간·교시</h2>
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
                <PeriodName
                  period={p}
                  disabled={!state.online || working || !!center?.deletedAt}
                  save={(name) =>
                    run(() =>
                      attendanceApi.period(p.id, {
                        name,
                        expectedRevision: p.revision,
                      })
                    )
                  }
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
                  !periodName.trim() ||
                  centerInactive
                }
              >
                교시 추가
              </button>
            </form>
          </section>
          <section hidden={tab !== "pages"}>
            <h2>페이지 · {period?.name || "교시를 선택하세요"}</h2>
            {pages.map((p, i) => (
              <div className="attendance-manage-row" key={p.id}>
                <button
                  className={pageId === p.id ? "selected" : ""}
                  onClick={() => {
                    setPageId(p.id);
                    setPreview(true);
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
            <p>센터·교시 관리와 휴지통 복구는 온라인에서 사용할 수 있습니다.</p>
          )}
          {error && <p role="alert">{error}</p>}
        </fieldset>
        {preview && pageId && tab === "pages" && (
          <AttendancePagePreview pageId={pageId} />
        )}
        <button
          disabled={working}
          onClick={() =>
            void workspace
              .setTarget(view)
              .catch(() => setError("오프라인 저장 대상 지정에 실패했습니다."))
          }
        >
          {state.target && termKey(state.target) === termKey(view)
            ? "이 학기 전체를 기기에 저장 중"
            : "이 학기를 오프라인 저장 대상으로 지정"}
        </button>
      </div>
    </ManagementDialog>
  );
}
function PeriodName({
  period,
  disabled,
  save,
}: {
  period: Period;
  disabled: boolean;
  save: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(period.name);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) void save(name);
      }}
    >
      <input
        aria-label={`${period.name} 이름`}
        maxLength={100}
        value={name}
        disabled={disabled}
        onChange={(e) => setName(e.target.value)}
      />
      <button disabled={disabled || !name.trim() || name === period.name}>
        이름 저장
      </button>
    </form>
  );
}
function WeekdayEditor({
  value,
  disabled,
  save,
}: {
  value: number;
  disabled: boolean;
  save: (day: number) => Promise<unknown>;
}) {
  const [day, setDay] = useState(value);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(day);
      }}
    >
      <label>
        수업 요일
        <select
          value={day}
          disabled={disabled}
          onChange={(e) => setDay(Number(e.target.value))}
        >
          {weekdays.map((d, i) => (
            <option key={d} value={i}>
              {d}요일
            </option>
          ))}
        </select>
      </label>
      <button disabled={disabled || day === value}>요일 저장</button>
    </form>
  );
}
