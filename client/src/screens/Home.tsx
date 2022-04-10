import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "react-query";
import { FcFolder, FcMusic, FcLeft } from "react-icons/fc";
import { api } from "../api";
import { usePath } from "../context/context";
import Loading from "../components/Loading";

const getLastPath = (path: string[]) => {
  if (path.length > 0) {
    return path[path.length - 1];
  }
  return "";
};
const getPath = (path: string[]) => {
  const [_, ...rest] = path;
  if (rest.length > 0) {
    return rest.join("/");
  }
  return "";
};

const musicExt: any = {
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

function Home() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sourceRef = useRef<HTMLSourceElement>(null);
  const [playingSong, setPlayingSong] = useState<string>();
  const [path, setPath] = usePath();
  // Queries
  const { isLoading, refetch, data } = useQuery(["playList", getPath(path)], api.playlist, {
    enabled: false,
  });
  /**
   * 폴더클릭시 재조회
   */
  useEffect(() => {
    // if (directory) {
    refetch();
    // }
  }, [path]);
  /**
   * 음악재생
   */
  useEffect(() => {
    if (playingSong && playingSong !== "") {
      if (sourceRef.current) {
        audioRef.current?.pause();
        sourceRef.current.src = `songs${
          getPath(path) === "" ? "" : `/${getPath(path)}`
        }/${playingSong}`;
        sourceRef.current.type = getType(playingSong);
        audioRef.current?.load();
        audioRef.current?.play();
      }
    }
  }, [playingSong]);
  /**
   * Loading
   */
  if (isLoading) {
    return <Loading />;
  }
  /**
   * 디렉토리 클릭이벤트
   * @param dir
   * @returns
   */
  const onClickDir = (dir: string) => setPath((prev: string[]) => [...prev, dir]);
  /**
   * 노래 클릭이벤트
   * @param song
   * @returns
   */
  const onClickPlaylist = (song: string) => setPlayingSong(song);
  /**
   * 뒤로가기
   */
  const onClickBack = () => {
    if (path.length > 1) {
      setPath((prev: string[]) => {
        const filtered = prev.filter((dir) => dir !== getLastPath(path));
        return filtered;
      });
    }
  };
  console.log(data);
  /**
   * render
   */
  return (
    <div className="container flex flex-col w-screen h-screen mx-auto items-center bg-slate-700 text-gray-300">
      <header className="my-6 text-2xl font-bold">오감별 음악</header>
      <div>
        <audio ref={audioRef} preload="metadata" controls>
          <source ref={sourceRef} src=""></source>
        </audio>
      </div>
      <div className="mt-2">
        <span>{playingSong ? playingSong : "재생중인 노래가 없습니다."}</span>
      </div>
      <div className="self-start px-4">
        <button onClick={onClickBack}>
          <FcLeft size={40} color={"red"} />
        </button>
      </div>
      <div className="self-start px-4 text-xl text-amber-400">
        {getPath(path).replaceAll("/", " / ")}
      </div>
      <div className="overflow-y-auto self-start w-full px-4 text-xl ">
        {data?.directory.map((dir: any) => (
          <div
            key={dir.name}
            className="truncate odd:bg-slate-900 even:bg-slate-800  rounded-sm cursor-pointer hover:bg-slate-400 hover:text-slate-800 p-2"
            onClick={() => onClickDir(dir.name)}
          >
            <FcFolder className="inline-block" /> {dir.name}
          </div>
        ))}
        {data?.playlist.map((file: any) => (
          <div
            key={file.name}
            className="truncate odd:bg-slate-900 even:bg-slate-800  rounded-sm cursor-pointer hover:bg-slate-400 hover:text-slate-800 p-2"
            onClick={() => onClickPlaylist(file.name)}
          >
            <FcMusic className="inline-block" /> {file.name}
          </div>
        ))}
      </div>
      <footer className="mt-10">Copyright © 2022 Dryadsoft</footer>
    </div>
  );
}

export default Home;
