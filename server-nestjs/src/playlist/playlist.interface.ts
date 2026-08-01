export interface StoredPlaylist {
  id: string;
  title: string;
  tracks: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistStore {
  version: 1;
  playlists: StoredPlaylist[];
}

export interface PlaylistTrack {
  path: string;
  name: string;
  available: boolean;
}

export interface PlaylistResponse extends Omit<StoredPlaylist, 'tracks'> {
  tracks: PlaylistTrack[];
}
