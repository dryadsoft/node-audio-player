import { FormEvent, useEffect, useState } from "react";
import { FiEdit2, FiMapPin, FiPlus, FiX } from "react-icons/fi";
import { useMutation, useQueryClient } from "react-query";
import { api } from "../api";
import { attendanceWorkspace } from "../attendance/workspace";
import ManagementDialog from "./ManagementDialog";
import { LessonLocation } from "../types";

interface LessonLocationDialogProps {
  locations: LessonLocation[];
  online?: boolean;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
  onNotice: (message: string, type?: "success" | "error") => void;
}

export function CenterManagement({
  locations,
  onClose,
  onNotice,
  onBusyChange,
  online = navigator.onLine,
}: LessonLocationDialogProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");

  const refresh = async () => {
    const latest = await api.lessonLocations();
    queryClient.setQueryData("lessonLocations", latest);
    await attendanceWorkspace.updateLocations(latest);
    await Promise.all([
      queryClient.invalidateQueries("lessonLocations"),
      queryClient.invalidateQueries("lessonPlans"),
      queryClient.invalidateQueries("lessonPlan"),
    ]);
  };

  const createMutation = useMutation(api.createLessonLocation, {
    onSuccess: async (location) => {
      await refresh();
      setNewName("");
      onNotice(`‘${location.name}’ 센터를 등록했습니다.`);
    },
    onError: (error: unknown) =>
      onNotice(
        error instanceof Error ? error.message : "센터 등록에 실패했습니다.",
        "error"
      ),
  });

  const updateMutation = useMutation(api.updateLessonLocation, {
    onSuccess: async (location) => {
      await refresh();
      setEditingId("");
      setEditingName("");
      onNotice(`‘${location.name}’ 센터 정보를 변경했습니다.`);
    },
    onError: (error: unknown) =>
      onNotice(
        error instanceof Error ? error.message : "센터 변경에 실패했습니다.",
        "error"
      ),
  });

  const busy = createMutation.isLoading || updateMutation.isLoading;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    if (online && !busy && newName.trim()) createMutation.mutate(newName);
  };

  const submitRename = (event: FormEvent, id: string) => {
    event.preventDefault();
    if (online && !busy && editingName.trim()) {
      updateMutation.mutate({ id, name: editingName });
    }
  };

  return (
    <section className="location-dialog">
      <header className="dialog-heading">
        <div>
          <span className="eyebrow">PLACE DIRECTORY</span>
          <h2 id="location-dialog-title">공통 센터 관리</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="센터 관리 돌아가기"
          onClick={onClose}
          disabled={busy}
        >
          <FiX />
        </button>
      </header>

      {!online && <p>센터 등록·변경은 온라인에서 사용할 수 있습니다.</p>}
      <fieldset
        disabled={busy || !online}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <form className="location-create-form" onSubmit={submitCreate}>
          <label htmlFor="new-location-name">새 센터 이름</label>
          <div>
            <input
              id="new-location-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="예: 서초 문화센터"
            />
            <button className="button accent" type="submit" disabled={busy}>
              <FiPlus /> 등록
            </button>
          </div>
        </form>

        <p>
          사용 중지는 모든 학기·요일에 적용됩니다. 기존 문서·사진·필기는
          보존됩니다.
        </p>
        <label>
          사용 상태
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={busy}
          >
            <option value="all">전체 센터</option>
            <option value="active">사용 중</option>
            <option value="inactive">사용 중지</option>
          </select>
        </label>
        <div className="location-list" aria-label="등록된 센터">
          {locations
            .filter(
              (l) => filter === "all" || l.active === (filter === "active")
            )
            .map((location) => (
              <article
                className={`location-row ${location.active ? "" : "inactive"}`}
                key={location.id}
              >
                {editingId === location.id ? (
                  <form onSubmit={(event) => submitRename(event, location.id)}>
                    <input
                      aria-label={`${location.name} 새 이름`}
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      autoFocus
                    />
                    <button
                      className="button accent"
                      type="submit"
                      disabled={busy}
                    >
                      저장
                    </button>
                    <button
                      className="button ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => setEditingId("")}
                    >
                      취소
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="location-name">
                      <FiMapPin />
                      <span>{location.name}</span>
                      <small>{location.active ? "사용 중" : "사용 중지"}</small>
                    </div>
                    <div className="location-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`${location.name} 이름 변경`}
                        onClick={() => {
                          setEditingId(location.id);
                          setEditingName(location.name);
                        }}
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() =>
                          updateMutation.mutate({
                            id: location.id,
                            active: !location.active,
                          })
                        }
                      >
                        {location.active ? "사용 중지" : "다시 사용"}
                      </button>
                    </div>
                  </>
                )}
              </article>
            ))}
          {locations.length === 0 ? (
            <div className="empty-state small">
              <FiMapPin />
              <strong>등록된 장소가 없습니다.</strong>
            </div>
          ) : null}
        </div>
      </fieldset>
    </section>
  );
}

export default function LessonLocationDialog(props: LessonLocationDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <ManagementDialog
      title="공통 센터 관리"
      onClose={props.onClose}
      busy={busy}
    >
      <CenterManagement {...props} onBusyChange={setBusy} />
    </ManagementDialog>
  );
}
