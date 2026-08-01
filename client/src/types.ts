export interface TrackReference {
  path: string;
  name: string;
}

export interface PlaylistTrack extends TrackReference {
  available: boolean;
}

export interface SavedPlaylist {
  id: string;
  title: string;
  tracks: PlaylistTrack[];
  createdAt: string;
  updatedAt: string;
}

export interface LibraryResponse {
  directory: Array<{ name: string }>;
  playlist: Array<{ name: string }>;
}
