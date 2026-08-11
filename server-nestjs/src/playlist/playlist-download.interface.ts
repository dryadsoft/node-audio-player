export type PlaylistDownloadState =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed';

export interface PlaylistDownloadStatus {
  id: string;
  playlistId: string;
  status: PlaylistDownloadState;
  completed: number;
  total: number;
  fileName?: string;
  error?: string;
}
