import {
  DeleteLessonCurriculumResult,
  LibraryResponse,
  LessonLocation,
  LessonCurriculum,
  LessonCurriculumSummary,
  LessonCurriculumWeek,
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
      `/api/playlist?dir=${encodeURIComponent(String(directory || ""))}`,
    );
  },
  search: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const [, keyword] = queryKey;
    return request<string[]>(
      `/api/search?keyword=${encodeURIComponent(String(keyword || ""))}`,
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
  lessonCurricula: ({
    year,
    term,
    programName,
  }: {
    year?: number;
    term?: LessonTerm;
    programName?: string;
  } = {}) => {
    const params = new URLSearchParams();
    if (year) params.set("year", String(year));
    if (term) params.set("term", term);
    if (programName) params.set("programName", programName);
    const query = params.toString();
    return request<LessonCurriculumSummary[]>(
      `/api/lesson-curricula${query ? `?${query}` : ""}`,
    );
  },
  lessonCurriculum: (id: string) =>
    request<LessonCurriculum>(
      `/api/lesson-curricula/${encodeURIComponent(id)}`,
    ),
  lessonCurriculumWeek: (id: string, week: number) =>
    request<LessonCurriculumWeek>(
      `/api/lesson-curricula/${encodeURIComponent(id)}/weeks/${week}`,
    ),
  createLessonCurriculum: (input: {
    year: number;
    term: LessonTerm;
    programName: string;
    sourcePlanId?: string;
  }) =>
    request<LessonCurriculum>("/api/lesson-curricula", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateLessonCurriculumWeek: ({
    id,
    week,
    ...input
  }: LessonCurriculumWeek & { id: string }) =>
    request<LessonCurriculumWeek>(
      `/api/lesson-curricula/${encodeURIComponent(id)}/weeks/${week}`,
      {
        method: "PUT",
        body: JSON.stringify({
          className: input.className,
          content: input.content,
          lessonPlan: input.lessonPlan,
          materials: input.materials,
          inkDocument: input.inkDocument,
          expectedRevision: input.revision,
        }),
      },
    ),
  replaceLessonCurriculumWeeks: ({
    id,
    sourcePlanId,
    expectedUpdatedAt,
  }: {
    id: string;
    sourcePlanId: string | null;
    expectedUpdatedAt: string;
  }) =>
    request<LessonCurriculum>(
      `/api/lesson-curricula/${encodeURIComponent(id)}/weeks`,
      {
        method: "PUT",
        body: JSON.stringify({ sourcePlanId, expectedUpdatedAt }),
      },
    ),
  deleteLessonCurriculum: ({
    id,
    expectedUpdatedAt,
  }: {
    id: string;
    expectedUpdatedAt: string;
  }) =>
    request<DeleteLessonCurriculumResult>(
      `/api/lesson-curricula/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ expectedUpdatedAt }),
      },
    ),
  lessonPlans: ({
    year,
    term,
    locationId,
    programName,
  }: {
    year?: number;
    term?: LessonTerm;
    locationId?: string;
    programName?: string;
  } = {}) => {
    const params = new URLSearchParams();
    if (year) params.set("year", String(year));
    if (term) params.set("term", term);
    if (locationId) params.set("locationId", locationId);
    if (programName) params.set("programName", programName);
    const query = params.toString();
    return request<LessonPlanSummary[]>(
      `/api/lesson-plans${query ? `?${query}` : ""}`,
    );
  },
  lessonPlan: (id: string) =>
    request<LessonPlan>(`/api/lesson-plans/${encodeURIComponent(id)}`),
  lessonPlanDocxUrl: (id: string) =>
    `/api/lesson-plans/${encodeURIComponent(id)}/docx`,
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
