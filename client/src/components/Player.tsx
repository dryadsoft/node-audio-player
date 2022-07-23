import React, { useEffect, useRef } from "react";

const musicExt: { [key: string]: string } = {
  mp3: "audio/mp3",
  ogg: "audio/ogg",
  aac: "audio/aac",
  wma: "audio/wma",
  wav: "audio/x-wav",
};
const getType = (songName: string) => {
  const songs = songName.split(".");
  return musicExt[songs[songs.length - 1]];
};

interface IPlayerProps {
  playingSong: string | undefined;
  path: any;
}

const Player: React.FC<IPlayerProps> = ({ playingSong, path }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sourceRef = useRef<HTMLSourceElement>(null);
  /**
   * 음악재생
   */
  useEffect(() => {
    if (playingSong && playingSong !== "") {
      if (sourceRef.current) {
        audioRef.current?.pause();
        sourceRef.current.src = `songs${
          path === "" ? "" : `/${path}`
        }/${playingSong}`;
        sourceRef.current.type = getType(playingSong);
        audioRef.current?.load();
        audioRef.current?.play();
      }
    }
  }, [playingSong]);

  return (
    <>
      <div>
        <audio ref={audioRef} preload="metadata" controls>
          <source ref={sourceRef} src=""></source>
        </audio>
      </div>
      <div className="mt-2">
        <span>{playingSong ? playingSong : "재생중인 노래가 없습니다."}</span>
      </div>
    </>
  );
};
export default Player;
