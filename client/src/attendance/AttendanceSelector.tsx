import { useEffect, useMemo, useState } from "react";
import ManagementDialog from "../components/ManagementDialog";
import { useAttendance } from "./workspace";
import { PageMeta, Term, termKey, terms } from "./types";
const days = ["일", "월", "화", "수", "목", "금", "토"];
export default function AttendanceSelector({
  view,
  onView,
  centerId,
  periodId,
  pageId,
  onClose,
  onManage,
  onSelect,
}: {
  view: Term;
  onView: (view: Term) => void;
  centerId: string;
  periodId: string;
  pageId: string;
  onClose: () => void;
  onManage: () => void;
  onSelect: (center: string, period: string, page: string) => void;
}) {
  const state = useAttendance();
  const catalog = state.catalogs.find(
    (c) => termKey(c.semester) === termKey(view)
  );
  const centers = useMemo(
    () =>
      catalog?.centers.filter(
        (c) =>
          !c.deletedAt &&
          catalog.locations.find((l) => l.id === c.locationId)?.active !== false
      ) || [],
    [catalog]
  );
  const [chosen, setChosen] = useState(centerId),
    [year, setYear] = useState(String(view.year));
  useEffect(() => {
    if (!centers.some((c) => c.id === chosen)) setChosen(centers[0]?.id || "");
  }, [centers, chosen]);
  const center = centers.find((c) => c.id === chosen);
  const locations = Array.from(new Set(centers.map((c) => c.locationId)));
  const periods =
    catalog?.periods
      .filter((p) => p.centerId === chosen && !p.deletedAt)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)) ||
    [];
  const pagesFor = (id: string) => {
    const map = new Map<string, PageMeta>();
    catalog?.pages
      .filter((p) => p.periodId === id)
      .forEach((p) => map.set(p.id, p));
    state.pages
      .filter((p) => p.local.periodId === id)
      .forEach((p) => {
        const remote = map.get(p.id);
        if (!remote || remote.revision <= p.local.revision)
          map.set(p.id, p.local);
      });
    return Array.from(map.values())
      .filter((p) => !p.deletedAt)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  };
  const currentPages = periods.some((p) => p.id === periodId)
    ? pagesFor(periodId)
    : [];
  return (
    <ManagementDialog title="출석부 선택" drawer onClose={onClose}>
      <div className="attendance-manager">
        <button onClick={onManage}>출석부 관리</button>
        <div className="attendance-fields">
          <label>
            연도
            <input
              type="number"
              min="2000"
              max="9999"
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                const number = Number(e.target.value);
                if (
                  /^\d{4}$/.test(e.target.value) &&
                  number >= 2000 &&
                  number <= 9999
                )
                  onView({ ...view, year: number });
              }}
            />
          </label>
          <label>
            학기
            <select
              value={view.term}
              onChange={(e) =>
                onView({ ...view, term: e.target.value as Term["term"] })
              }
            >
              {Object.entries(terms).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          센터
          <select
            aria-label="센터 선택"
            value={center?.locationId || ""}
            onChange={(e) =>
              setChosen(
                centers.find((c) => c.locationId === e.target.value)?.id || ""
              )
            }
          >
            <option value="">센터 선택</option>
            {locations.map((id) => (
              <option key={id} value={id}>
                {catalog?.locations.find((l) => l.id === id)?.name || id}
              </option>
            ))}
          </select>
        </label>
        <label>
          요일
          <select
            aria-label="요일 선택"
            disabled={!center}
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
          >
            {!center && <option value="">요일 선택</option>}
            {centers
              .filter((c) => c.locationId === center?.locationId)
              .sort((a, b) => a.weekday - b.weekday)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {days[c.weekday]}요일
                </option>
              ))}
          </select>
        </label>
        <section>
          <h2>수업시간·교시</h2>
          <div className="attendance-selection-list">
            {periods.map((p) => (
              <button
                key={p.id}
                aria-current={p.id === periodId ? "true" : undefined}
                onClick={() =>
                  onSelect(chosen, p.id, pagesFor(p.id)[0]?.id || "")
                }
              >
                {p.name}
              </button>
            ))}
          </div>
          {!periods.length && (
            <p>
              등록된 수업이 없습니다. 출석부 관리에서 센터와 교시를 준비하세요.
            </p>
          )}
        </section>
        {!!currentPages.length && (
          <section>
            <h2>현재 수업의 페이지</h2>
            <div className="attendance-selection-list">
              {currentPages.map((p, i) => (
                <button
                  key={p.id}
                  aria-current={p.id === pageId ? "true" : undefined}
                  onClick={() => onSelect(chosen, periodId, p.id)}
                >
                  {i + 1}페이지 · {p.pageType === "note" ? "줄노트" : "사진"}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </ManagementDialog>
  );
}
