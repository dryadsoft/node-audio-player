import {
  LibraryResponse,
  LessonLocation,
  LessonPlan,
  LessonPlanInput,
  LessonPlanSummary,
  LessonTerm,
  PlaylistDownloadStatus,
  SavedPlaylist,
} from "../types";

const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || "요청을 처리하지 못했습니다.");
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }
  return response.json();
};

export const api = {
  playlist: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const [, directory] = queryKey;
    return request<LibraryResponse>(
      `/api/playlist?dir=${encodeURIComponent(String(directory || ""))}`
    );
  },
  search: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const [, keyword] = queryKey;
    return request<string[]>(
      `/api/search?keyword=${encodeURIComponent(String(keyword || ""))}`
    );
  },
  playlists: () => request<SavedPlaylist[]>("/api/playlists"),
  createPlaylist: (title: string) =>
    request<SavedPlaylist>("/api/playlists", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  renamePlaylist: ({ id, title }: { id: string; title: string }) =>
    request<SavedPlaylist>(`/api/playlists/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  deletePlaylist: (id: string) =>
    request<void>(`/api/playlists/${id}`, { method: "DELETE" }),
  addTrack: ({ id, path }: { id: string; path: string }) =>
    request<SavedPlaylist>(`/api/playlists/${id}/tracks`, {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  removeTrack: ({ id, path }: { id: string; path: string }) =>
    request<SavedPlaylist>(`/api/playlists/${id}/tracks`, {
      method: "DELETE",
      body: JSON.stringify({ path }),
    }),
  reorderTracks: ({ id, paths }: { id: string; paths: string[] }) =>
    request<SavedPlaylist>(`/api/playlists/${id}/tracks/order`, {
      method: "PUT",
      body: JSON.stringify({ paths }),
    }),
  startPlaylistDownload: (id: string) =>
    request<PlaylistDownloadStatus>(`/api/playlists/${id}/downloads`, {
      method: "POST",
    }),
  playlistDownloadStatus: (id: string) =>
    request<PlaylistDownloadStatus>(`/api/playlist-downloads/${id}`),
  playlistDownloadUrl: (id: string) =>
    `/api/playlist-downloads/${encodeURIComponent(id)}/file`,
  lessonLocations: () =>
    request<LessonLocation[]>("/api/lesson-locations?includeInactive=true"),
  createLessonLocation: (name: string) =>
    request<LessonLocation>("/api/lesson-locations", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  updateLessonLocation: ({
    id,
    ...changes
  }: {
    id: string;
    name?: string;
    active?: boolean;
  }) =>
    request<LessonLocation>(`/api/lesson-locations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  lessonPlans: ({
    year,
    term,
    locationId,
  }: {
    year?: number;
    term?: LessonTerm;
    locationId?: string;
  } = {}) => {
    const params = new URLSearchParams();
    if (year) params.set("year", String(year));
    if (term) params.set("term", term);
    if (locationId) params.set("locationId", locationId);
    const query = params.toString();
    return request<LessonPlanSummary[]>(
      `/api/lesson-plans${query ? `?${query}` : ""}`
    );
  },
  lessonPlan: (id: string) =>
    request<LessonPlan>(`/api/lesson-plans/${encodeURIComponent(id)}`),
  createLessonPlan: (input: LessonPlanInput) =>
    request<LessonPlan>("/api/lesson-plans", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateLessonPlan: ({
    id,
    expectedRevision,
    ...input
  }: LessonPlanInput & { id: string; expectedRevision: number }) =>
    request<LessonPlan>(`/api/lesson-plans/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ ...input, expectedRevision }),
    }),
};
