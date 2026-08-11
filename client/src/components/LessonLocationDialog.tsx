import { FormEvent, useState } from "react";
import { FiEdit2, FiMapPin, FiPlus, FiX } from "react-icons/fi";
import { useMutation, useQueryClient } from "react-query";
import { api } from "../api";
import { LessonLocation } from "../types";

interface LessonLocationDialogProps {
  locations: LessonLocation[];
  onClose: () => void;
  onNotice: (message: string, type?: "success" | "error") => void;
}

function LessonLocationDialog({
  locations,
  onClose,
  onNotice,
}: LessonLocationDialogProps) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries("lessonLocations"),
      queryClient.invalidateQueries("lessonPlans"),
    ]);
  };

  const createMutation = useMutation(api.createLessonLocation, {
    onSuccess: async (location) => {
      setNewName("");
      await refresh();
      onNotice(`‘${location.name}’ 장소를 등록했습니다.`);
    },
    onError: (error: unknown) =>
      onNotice(
        error instanceof Error ? error.message : "장소 등록에 실패했습니다.",
        "error"
      ),
  });

  const updateMutation = useMutation(api.updateLessonLocation, {
    onSuccess: async (location) => {
      setEditingId("");
      setEditingName("");
      await refresh();
      onNotice(`‘${location.name}’ 장소 정보를 변경했습니다.`);
    },
    onError: (error: unknown) =>
      onNotice(
        error instanceof Error ? error.message : "장소 변경에 실패했습니다.",
        "error"
      ),
  });

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    if (newName.trim()) createMutation.mutate(newName);
  };

  const submitRename = (event: FormEvent, id: string) => {
    event.preventDefault();
    if (editingName.trim()) {
      updateMutation.mutate({ id, name: editingName });
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="dialog-card location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-dialog-title"
      >
        <header className="dialog-heading">
          <div>
            <span className="eyebrow">PLACE DIRECTORY</span>
            <h2 id="location-dialog-title">수업 장소 관리</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="장소 관리 닫기"
            onClick={onClose}
          >
            <FiX />
          </button>
        </header>

        <form className="location-create-form" onSubmit={submitCreate}>
          <label htmlFor="new-location-name">새 장소 이름</label>
          <div>
            <input
              id="new-location-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="예: 서초 문화센터"
            />
            <button
              className="button accent"
              type="submit"
              disabled={createMutation.isLoading}
            >
              <FiPlus /> 등록
            </button>
          </div>
        </form>

        <div className="location-list" aria-label="등록된 장소">
          {locations.map((location) => (
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
                  <button className="button accent" type="submit">
                    저장
                  </button>
                  <button
                    className="button ghost"
                    type="button"
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
      </section>
    </div>
  );
}

export default LessonLocationDialog;
