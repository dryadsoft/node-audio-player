import "@testing-library/jest-dom";
import { DndContext } from "@dnd-kit/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { ComponentProps } from "react";
import Playlist from "./Playlist";
import { SavedPlaylist } from "../types";

const createPlaylist = (names: string[]): SavedPlaylist => ({
  id: "playlist-1",
  title: "수업 음악",
  tracks: names.map((name) => ({
    name,
    path: `수업 음악/${name}`,
    available: true,
  })),
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
});

const renderPlaylist = (selectedPlaylist: SavedPlaylist) => {
  const props: ComponentProps<typeof Playlist> = {
    playlists: [selectedPlaylist],
    selectedPlaylist,
    busy: false,
    onSelect: jest.fn(),
    onOpenCreate: jest.fn(),
    onRename: jest.fn(),
    onDelete: jest.fn(),
    onRemoveTrack: jest.fn(),
    onPlay: jest.fn(),
    downloadBusy: false,
    downloadStatus: undefined,
    onDownload: jest.fn(),
  };

  const view = render(
    <DndContext>
      <Playlist {...props} />
    </DndContext>
  );

  return {
    ...view,
    props,
    rerenderPlaylist: (
      playlist: SavedPlaylist,
      overrides: Partial<typeof props> = {}
    ) =>
      view.rerender(
        <DndContext>
          <Playlist
            {...props}
            {...overrides}
            playlists={[playlist]}
            selectedPlaylist={playlist}
          />
        </DndContext>
      ),
  };
};

describe("Playlist", () => {
  it("numbers displayed filenames from their current playlist positions", () => {
    const { rerenderPlaylist } = renderPlaylist(
      createPlaylist(["03.통통통.mp3", "하이헬로.wma", "001. 세이 굿바이.wma"])
    );

    expect(screen.getByText("01.통통통.mp3")).toBeInTheDocument();
    expect(screen.getByText("02.하이헬로.wma")).toBeInTheDocument();
    expect(screen.getByText("03.세이 굿바이.wma")).toBeInTheDocument();

    rerenderPlaylist(createPlaylist(["하이헬로.wma", "03.통통통.mp3"]));

    expect(screen.getByText("01.하이헬로.wma")).toBeInTheDocument();
    expect(screen.getByText("02.통통통.mp3")).toBeInTheDocument();
  });

  it("starts a download and shows ordered MP3 preparation progress", () => {
    const playlist = createPlaylist([
      "01.하이헬로.wma",
      "02.업다운.mp3",
      "03.통통통.wav",
    ]);
    const { props, rerenderPlaylist } = renderPlaylist(playlist);

    fireEvent.click(
      screen.getByRole("button", { name: "수업 음악 MP3 ZIP 다운로드" })
    );
    expect(props.onDownload).toHaveBeenCalledTimes(1);

    rerenderPlaylist(playlist, {
      downloadBusy: true,
      downloadStatus: {
        id: "download-1",
        playlistId: playlist.id,
        status: "processing",
        completed: 1,
        total: 3,
      },
    });

    expect(screen.getByText("준비 중 1/3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "수업 음악 MP3 ZIP 다운로드" })
    ).toBeDisabled();
  });
});
