import { FormEvent, useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FiDownload, FiEdit2, FiList, FiPlus, FiTrash2 } from "react-icons/fi";
import { MdDragIndicator } from "react-icons/md";
import {
  PlaylistDownloadStatus,
  PlaylistTrack,
  SavedPlaylist,
} from "../types";

interface PlaylistPanelProps {
  playlists: SavedPlaylist[];
  selectedPlaylist?: SavedPlaylist;
  busy: boolean;
  onSelect: (id: string) => void;
  onOpenCreate: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onRemoveTrack: (path: string) => void;
  onPlay: (track: PlaylistTrack) => void;
  downloadBusy: boolean;
  downloadStatus?: PlaylistDownloadStatus;
  onDownload: () => void;
}

interface SortableTrackProps {
  track: PlaylistTrack;
  position: number;
  onRemove: () => void;
  onPlay: () => void;
}

const getDisplayName = (name: string, position: number) => {
  const title = name.replace(/^\d+\.\s*/, "");
  return `${String(position).padStart(2, "0")}.${title}`;
};

const SortableTrack = ({
  track,
  position,
  onRemove,
  onPlay,
}: SortableTrackProps) => {
  const displayName = getDisplayName(track.name, position);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `saved:${track.path}`,
      data: { type: "saved", path: track.path, name: displayName },
    });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`track-row saved-track ${isDragging ? "is-dragging" : ""} ${
        track.available ? "" : "is-missing"
      }`}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`${displayName} 순서 변경`}
        {...attributes}
        {...listeners}
      >
        <MdDragIndicator />
      </button>
      <button
        type="button"
        className="track-main"
        onClick={onPlay}
        disabled={!track.available}
      >
        <span className="track-name">{displayName}</span>
        <span className="track-path">
          {track.available ? track.path : "원본 없음"}
        </span>
      </button>
      <button
        type="button"
        className="icon-button danger"
        aria-label={`${displayName} 삭제`}
        onClick={onRemove}
      >
        <FiTrash2 />
      </button>
    </li>
  );
};

const Playlist = ({
  playlists,
  selectedPlaylist,
  busy,
  onSelect,
  onOpenCreate,
  onRename,
  onDelete,
  onRemoveTrack,
  onPlay,
  downloadBusy,
  downloadStatus,
  onDownload,
}: PlaylistPanelProps) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(selectedPlaylist?.title || "");
  const { setNodeRef, isOver } = useDroppable({ id: "playlist-drop" });

  useEffect(() => {
    setTitle(selectedPlaylist?.title || "");
    setIsRenaming(false);
  }, [selectedPlaylist?.id, selectedPlaylist?.title]);

  const submitRename = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || title.trim() === selectedPlaylist?.title) {
      setIsRenaming(false);
      setTitle(selectedPlaylist?.title || "");
      return;
    }
    onRename(title);
    setIsRenaming(false);
  };

  return (
    <section className="playlist-panel" aria-label="내 재생목록">
      <aside className="playlist-sidebar">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">COLLECTIONS</span>
            <h2>내 재생목록</h2>
          </div>
          <button
            type="button"
            className="icon-button accent"
            aria-label="새 재생목록"
            onClick={onOpenCreate}
          >
            <FiPlus />
          </button>
        </div>
        <div className="playlist-title-list" role="listbox" aria-label="재생목록 선택">
          {playlists.map((playlist) => (
            <button
              type="button"
              role="option"
              aria-selected={playlist.id === selectedPlaylist?.id}
              className={playlist.id === selectedPlaylist?.id ? "active" : ""}
              key={playlist.id}
              onClick={() => onSelect(playlist.id)}
            >
              <FiList />
              <span>{playlist.title}</span>
              <strong>{playlist.tracks.length}</strong>
            </button>
          ))}
        </div>
      </aside>

      <div className="playlist-content">
        <div className="mobile-playlist-picker">
          <label htmlFor="playlist-select">재생목록</label>
          <div className="select-row">
            <select
              id="playlist-select"
              value={selectedPlaylist?.id || ""}
              onChange={(event) => onSelect(event.target.value)}
            >
              <option value="" disabled>
                목록을 선택하세요
              </option>
              {playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.title} ({playlist.tracks.length})
                </option>
              ))}
            </select>
            <button type="button" className="button secondary" onClick={onOpenCreate}>
              <FiPlus /> 새 목록
            </button>
          </div>
        </div>

        {selectedPlaylist ? (
          <>
            <div className="selected-playlist-heading">
              {isRenaming ? (
                <form onSubmit={submitRename} className="rename-form">
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    autoFocus
                    aria-label="재생목록 제목"
                  />
                  <button className="button accent" type="submit" disabled={busy}>
                    저장
                  </button>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => setIsRenaming(false)}
                  >
                    취소
                  </button>
                </form>
              ) : (
                <div>
                  <span className="eyebrow">NOW EDITING</span>
                  <h2>{selectedPlaylist.title}</h2>
                </div>
              )}
              {!isRenaming ? (
                <div className="heading-actions">
                  <button
                    type="button"
                    className={`button secondary download-button ${
                      downloadBusy ? "is-preparing" : ""
                    }`}
                    aria-label={`${selectedPlaylist.title} MP3 ZIP 다운로드`}
                    onClick={onDownload}
                    disabled={downloadBusy || selectedPlaylist.tracks.length === 0}
                  >
                    <FiDownload />
                    <span>
                      {downloadStatus
                        ? `준비 중 ${downloadStatus.completed}/${downloadStatus.total}`
                        : downloadBusy
                        ? "준비 중"
                        : "MP3 ZIP"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="재생목록 이름 변경"
                    onClick={() => setIsRenaming(true)}
                  >
                    <FiEdit2 />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label="재생목록 삭제"
                    onClick={onDelete}
                  >
                    <FiTrash2 />
                  </button>
                </div>
              ) : null}
            </div>
            <div
              ref={setNodeRef}
              className={`playlist-dropzone ${isOver ? "is-over" : ""}`}
            >
              <SortableContext
                items={selectedPlaylist.tracks.map((track) => `saved:${track.path}`)}
                strategy={verticalListSortingStrategy}
              >
                {selectedPlaylist.tracks.length > 0 ? (
                  <ol className="track-list">
                    {selectedPlaylist.tracks.map((track, index) => (
                      <SortableTrack
                        key={track.path}
                        track={track}
                        position={index + 1}
                        onPlay={() => onPlay(track)}
                        onRemove={() => onRemoveTrack(track.path)}
                      />
                    ))}
                  </ol>
                ) : (
                  <div className="empty-state">
                    <FiList />
                    <strong>아직 담긴 곡이 없습니다.</strong>
                    <span>왼쪽에서 곡을 끌어놓거나 추가 버튼을 누르세요.</span>
                  </div>
                )}
              </SortableContext>
            </div>
          </>
        ) : (
          <div ref={setNodeRef} className={`empty-state panel-empty ${isOver ? "is-over" : ""}`}>
            <FiList />
            <strong>첫 재생목록을 만들어보세요.</strong>
            <span>제목을 정하면 원본을 건드리지 않고 곡 경로만 저장합니다.</span>
            <button type="button" className="button accent" onClick={onOpenCreate}>
              <FiPlus /> 새 목록 만들기
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default Playlist;
