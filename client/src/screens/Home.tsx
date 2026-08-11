import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  FiArrowLeft,
  FiFolder,
  FiMusic,
  FiPlus,
  FiSearch,
  FiX,
} from "react-icons/fi";
import { MdDragIndicator } from "react-icons/md";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { api } from "../api";
import Player from "../components/Player";
import Playlist from "../components/Playlist";
import AppNavigation from "../components/AppNavigation";
import {
  LibraryResponse,
  PlaylistDownloadStatus,
  PlaylistTrack,
  SavedPlaylist,
  TrackReference,
} from "../types";

const getName = (path: string) => path.substring(path.lastIndexOf("/") + 1);

interface LibraryTrackRowProps {
  track: TrackReference;
  added: boolean;
  onPlay: () => void;
  onAdd: () => void;
}

interface Notice {
  id: number;
  message: string;
  type: "success" | "error";
}

const LibraryTrackRow = ({ track, added, onPlay, onAdd }: LibraryTrackRowProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `library:${track.path}`,
    data: { type: "library", path: track.path, name: track.name },
  });

  return (
    <li
      ref={setNodeRef}
      className={`track-row library-track ${isDragging ? "is-dragging" : ""}`}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
    >
      <button
        type="button"
        className="drag-handle desktop-drag-handle"
        aria-label={`${track.name} 재생목록으로 드래그`}
        {...attributes}
        {...listeners}
      >
        <MdDragIndicator />
      </button>
      <button type="button" className="track-main" onClick={onPlay}>
        <span className="track-name"><FiMusic /> {track.name}</span>
        <span className="track-path">{track.path}</span>
      </button>
      <button
        type="button"
        className={`icon-button ${added ? "is-added" : "accent"}`}
        aria-label={added ? `${track.name} 추가됨` : `${track.name} 추가`}
        onClick={onAdd}
        disabled={added}
      >
        {added ? "✓" : <FiPlus />}
      </button>
    </li>
  );
};

function Home() {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [playingTrack, setPlayingTrack] = useState<TrackReference>();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [mobileTab, setMobileTab] = useState<"library" | "playlists">("library");
  const [notice, setNotice] = useState<Notice>();
  const [activeDragName, setActiveDragName] = useState("");
  const [createDialog, setCreateDialog] = useState<{ open: boolean; path?: string }>({
    open: false,
  });
  const [newTitle, setNewTitle] = useState("");
  const [downloadStatus, setDownloadStatus] =
    useState<PlaylistDownloadStatus>();

  const directory = path.join("/");
  const libraryQuery = useQuery<LibraryResponse>(
    ["playList", directory],
    api.playlist
  );
  const searchQuery = useQuery<string[]>(["search", keyword], api.search, {
    enabled: false,
  });
  const playlistsQuery = useQuery<SavedPlaylist[]>("playlists", api.playlists);
  const playlists = useMemo(() => playlistsQuery.data || [], [playlistsQuery.data]);
  const selectedPlaylist = playlists.find(
    (playlist) => playlist.id === selectedPlaylistId
  );

  useEffect(() => {
    if (!selectedPlaylist && playlists.length > 0) {
      setSelectedPlaylistId(playlists[0].id);
    }
  }, [playlists, selectedPlaylist]);

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(
      () =>
        setNotice((current) => (current?.id === notice.id ? undefined : current)),
      notice.type === "success" ? 3000 : 5000
    );
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const replacePlaylist = (updated: SavedPlaylist) => {
    queryClient.setQueryData<SavedPlaylist[]>("playlists", (current = []) =>
      current.map((playlist) => (playlist.id === updated.id ? updated : playlist))
    );
  };

  const showNotice = (message: string, type: Notice["type"] = "success") => {
    setNotice({ id: Date.now(), message, type });
  };

  const showError = (error: unknown) => {
    showNotice(
      error instanceof Error ? error.message : "요청을 처리하지 못했습니다.",
      "error"
    );
  };

  const createMutation = useMutation(
    async ({ title, pendingPath }: { title: string; pendingPath?: string }) => {
      const playlist = await api.createPlaylist(title);
      return pendingPath
        ? api.addTrack({ id: playlist.id, path: pendingPath })
        : playlist;
    },
    {
      onSuccess: (playlist) => {
        queryClient.setQueryData<SavedPlaylist[]>("playlists", (current = []) => [
          ...current,
          playlist,
        ]);
        setSelectedPlaylistId(playlist.id);
        setCreateDialog({ open: false });
        setNewTitle("");
        showNotice(`‘${playlist.title}’ 목록을 만들었습니다.`);
      },
      onError: showError,
    }
  );

  const addMutation = useMutation(api.addTrack, {
    onSuccess: (playlist) => {
      replacePlaylist(playlist);
      showNotice("선택한 목록에 곡을 추가했습니다.");
    },
    onError: showError,
  });
  const removeMutation = useMutation(api.removeTrack, {
    onSuccess: replacePlaylist,
    onError: showError,
  });
  const renameMutation = useMutation(api.renamePlaylist, {
    onSuccess: (playlist) => {
      replacePlaylist(playlist);
      showNotice("재생목록 제목을 변경했습니다.");
    },
    onError: showError,
  });
  const deleteMutation = useMutation(api.deletePlaylist, {
    onSuccess: (_, id) => {
      queryClient.setQueryData<SavedPlaylist[]>("playlists", (current = []) =>
        current.filter((playlist) => playlist.id !== id)
      );
      setSelectedPlaylistId("");
      showNotice("재생목록을 삭제했습니다.");
    },
    onError: showError,
  });
  const reorderMutation = useMutation(api.reorderTracks, {
    onMutate: async ({ id, paths }) => {
      await queryClient.cancelQueries("playlists");
      const previous = queryClient.getQueryData<SavedPlaylist[]>("playlists");
      queryClient.setQueryData<SavedPlaylist[]>("playlists", (current = []) =>
        current.map((playlist) =>
          playlist.id === id
            ? {
                ...playlist,
                tracks: paths
                  .map((trackPath) => playlist.tracks.find((track) => track.path === trackPath))
                  .filter((track): track is PlaylistTrack => Boolean(track)),
              }
            : playlist
        )
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      const previous = (context as { previous?: SavedPlaylist[] } | undefined)
        ?.previous;
      if (previous) {
        queryClient.setQueryData("playlists", previous);
      }
      showError(error);
    },
    onSuccess: replacePlaylist,
  });
  const downloadMutation = useMutation(
    async (playlistId: string) => {
      let current = await api.startPlaylistDownload(playlistId);
      setDownloadStatus(current);
      while (current.status === "queued" || current.status === "processing") {
        await new Promise((resolvePromise) =>
          window.setTimeout(resolvePromise, 1000)
        );
        current = await api.playlistDownloadStatus(current.id);
        setDownloadStatus(current);
      }
      if (current.status === "failed") {
        throw new Error(current.error || "다운로드 파일을 준비하지 못했습니다.");
      }
      return current;
    },
    {
      onSuccess: (download) => {
        const link = document.createElement("a");
        link.href = api.playlistDownloadUrl(download.id);
        link.download = download.fileName || "playlist.zip";
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setDownloadStatus(undefined);
        showNotice("MP3 ZIP 다운로드를 시작했습니다.");
      },
      onError: (error) => {
        setDownloadStatus(undefined);
        showError(error);
      },
    }
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const tracks = useMemo<TrackReference[]>(() => {
    if (searchActive) {
      return (searchQuery.data || []).map((trackPath) => ({
        path: trackPath,
        name: getName(trackPath),
      }));
    }
    return (libraryQuery.data?.playlist || []).map(({ name }) => ({
      name,
      path: directory ? `${directory}/${name}` : name,
    }));
  }, [directory, libraryQuery.data?.playlist, searchActive, searchQuery.data]);

  const addTrack = (trackPath: string) => {
    if (!selectedPlaylist) {
      setCreateDialog({ open: true, path: trackPath });
      return;
    }
    if (selectedPlaylist.tracks.some((track) => track.path === trackPath)) {
      showNotice("이미 선택한 목록에 있는 곡입니다.", "error");
      return;
    }
    addMutation.mutate({ id: selectedPlaylist.id, path: trackPath });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragName(String(event.active.data.current?.name || getName(String(event.active.data.current?.path || ""))));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragName("");
    const { active, over } = event;
    if (!over) return;
    const type = active.data.current?.type;
    const trackPath = String(active.data.current?.path || "");
    if (type === "library") {
      addTrack(trackPath);
      return;
    }
    if (type === "saved" && selectedPlaylist && over.id !== active.id) {
      const oldIndex = selectedPlaylist.tracks.findIndex(
        (track) => `saved:${track.path}` === active.id
      );
      const newIndex = selectedPlaylist.tracks.findIndex(
        (track) => `saved:${track.path}` === over.id
      );
      if (oldIndex >= 0 && newIndex >= 0) {
        const ordered = arrayMove(selectedPlaylist.tracks, oldIndex, newIndex).map(
          (track) => track.path
        );
        reorderMutation.mutate({ id: selectedPlaylist.id, paths: ordered });
      }
    }
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (!keyword.trim()) {
      setSearchActive(false);
      return;
    }
    setSearchActive(true);
    searchQuery.refetch();
  };

  const clearSearch = () => {
    setKeyword("");
    setSearchActive(false);
    searchInputRef.current?.focus();
  };

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    if (newTitle.trim()) {
      createMutation.mutate({ title: newTitle, pendingPath: createDialog.path });
    }
  };

  const busy =
    createMutation.isLoading ||
    addMutation.isLoading ||
    removeMutation.isLoading ||
    renameMutation.isLoading ||
    deleteMutation.isLoading ||
    reorderMutation.isLoading;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragName("")}
    >
      <main className="app-shell">
        <AppNavigation />
        <header className="player-header">
          <div className="brand-block">
            <span className="brand-mark">OG</span>
            <div>
              <span className="eyebrow">MUSIC LIBRARY</span>
              <h1>오감별 음악</h1>
            </div>
          </div>
          <div className="player-block">
            <Player track={playingTrack} />
          </div>
        </header>

        <nav className="mobile-tabs" aria-label="작업 영역">
          <button
            className={mobileTab === "library" ? "active" : ""}
            onClick={() => setMobileTab("library")}
          >
            음악 보관함
          </button>
          <button
            className={mobileTab === "playlists" ? "active" : ""}
            onClick={() => setMobileTab("playlists")}
          >
            내 재생목록
          </button>
        </nav>

        <div className="workspace">
          <section
            className={`library-panel ${mobileTab === "library" ? "mobile-active" : ""}`}
            aria-label="음악 보관함"
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SOURCE LIBRARY</span>
                <h2>{searchActive ? "검색 결과" : "음악 보관함"}</h2>
              </div>
              <div className="mobile-target">
                <label htmlFor="target-playlist">추가할 목록</label>
                <select
                  id="target-playlist"
                  value={selectedPlaylistId}
                  onChange={(event) => setSelectedPlaylistId(event.target.value)}
                >
                  <option value="">새 목록 만들기</option>
                  {playlists.map((playlist) => (
                    <option key={playlist.id} value={playlist.id}>
                      {playlist.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <form className="search-form" onSubmit={submitSearch} role="search">
              <FiSearch />
              <div className="search-input-wrap">
                <input
                  ref={searchInputRef}
                  value={keyword}
                  onChange={(event) => {
                    setKeyword(event.target.value);
                    if (!event.target.value) setSearchActive(false);
                  }}
                  placeholder="노래 제목 검색"
                  aria-label="노래 제목 검색"
                />
                {keyword ? (
                  <button
                    type="button"
                    className="search-clear"
                    aria-label="검색어 지우기"
                    onClick={clearSearch}
                  >
                    <FiX />
                  </button>
                ) : null}
              </div>
              <button type="submit" className="button accent">검색</button>
            </form>

            {!searchActive ? (
              <div className="path-toolbar">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="상위 폴더"
                  onClick={() => setPath((current) => current.slice(0, -1))}
                  disabled={path.length === 0}
                >
                  <FiArrowLeft />
                </button>
                <div className="breadcrumb">
                  <button type="button" onClick={() => setPath([])}>음악</button>
                  {path.map((segment, index) => (
                    <span key={`${segment}-${index}`}>
                      <b>/</b>
                      <button type="button" onClick={() => setPath(path.slice(0, index + 1))}>
                        {segment}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <button type="button" className="back-to-library" onClick={() => setSearchActive(false)}>
                <FiArrowLeft /> 폴더 탐색으로 돌아가기
              </button>
            )}

            <div className="library-scroll">
              {libraryQuery.isLoading || (searchActive && searchQuery.isFetching) ? (
                <div className="loading-state">음악 목록을 불러오는 중...</div>
              ) : null}
              {!searchActive
                ? libraryQuery.data?.directory.map((folder) => (
                    <button
                      type="button"
                      className="folder-row"
                      key={folder.name}
                      onClick={() => setPath((current) => [...current, folder.name])}
                    >
                      <FiFolder />
                      <span>{folder.name}</span>
                      <b>열기</b>
                    </button>
                  ))
                : null}
              <ul className="track-list">
                {tracks.map((track) => (
                  <LibraryTrackRow
                    key={track.path}
                    track={track}
                    added={Boolean(
                      selectedPlaylist?.tracks.some((item) => item.path === track.path)
                    )}
                    onPlay={() => setPlayingTrack(track)}
                    onAdd={() => addTrack(track.path)}
                  />
                ))}
              </ul>
              {tracks.length === 0 && !libraryQuery.isLoading && !searchQuery.isFetching ? (
                <div className="empty-state small">
                  <FiMusic />
                  <strong>{searchActive ? "검색 결과가 없습니다." : "이 폴더에 음악이 없습니다."}</strong>
                </div>
              ) : null}
            </div>
          </section>

          <div className={`playlist-column ${mobileTab === "playlists" ? "mobile-active" : ""}`}>
            <Playlist
              playlists={playlists}
              selectedPlaylist={selectedPlaylist}
              busy={busy}
              onSelect={setSelectedPlaylistId}
              onOpenCreate={() => setCreateDialog({ open: true })}
              onRename={(title) =>
                selectedPlaylist && renameMutation.mutate({ id: selectedPlaylist.id, title })
              }
              onDelete={() => {
                if (
                  selectedPlaylist &&
                  window.confirm(`‘${selectedPlaylist.title}’ 목록을 삭제할까요?`)
                ) {
                  deleteMutation.mutate(selectedPlaylist.id);
                }
              }}
              onRemoveTrack={(trackPath) =>
                selectedPlaylist &&
                removeMutation.mutate({ id: selectedPlaylist.id, path: trackPath })
              }
              onPlay={(track) => setPlayingTrack(track)}
              downloadBusy={downloadMutation.isLoading}
              downloadStatus={
                downloadStatus?.playlistId === selectedPlaylist?.id
                  ? downloadStatus
                  : undefined
              }
              onDownload={() =>
                selectedPlaylist && downloadMutation.mutate(selectedPlaylist.id)
              }
            />
          </div>
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

        {createDialog.open ? (
          <div className="modal-backdrop" role="presentation">
            <section
              className="dialog-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-playlist-title"
            >
              <span className="eyebrow">NEW COLLECTION</span>
              <h2 id="create-playlist-title">새 재생목록</h2>
              {createDialog.path ? <p>목록을 만들면 선택한 곡이 바로 추가됩니다.</p> : null}
              <form onSubmit={submitCreate}>
                <label htmlFor="new-playlist-title">목록 제목</label>
                <input
                  id="new-playlist-title"
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  autoFocus
                  placeholder="예: 아침 수업 음악"
                />
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => {
                      setCreateDialog({ open: false });
                      setNewTitle("");
                    }}
                  >
                    취소
                  </button>
                  <button className="button accent" type="submit" disabled={createMutation.isLoading}>
                    만들기
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </main>
      <DragOverlay>
        {activeDragName ? <div className="drag-overlay"><FiMusic /> {activeDragName}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

export default Home;
