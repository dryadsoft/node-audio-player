import { ChangeEvent, FormEvent, Fragment, useEffect, useState } from "react";
import { useQuery } from "react-query";
import { FcFolder, FcMusic, FcLeft } from "react-icons/fc";
import { ChevronRightIcon, SearchIcon } from "@heroicons/react/outline";
import { api } from "../api";
import { useKeyword, usePath } from "../context/context";
import Loading from "../components/Loading";
import { useNavigate } from "react-router-dom";
import Player from "../components/Player";

const getLastPath = (path: string[]) => {
  if (path.length > 0) {
    return path[path.length - 1];
  }
  return "";
};
export const getPath = (path: string[]) => {
  const [_, ...rest] = path;
  if (rest.length > 0) {
    return rest.join("/");
  }
  return "";
};

function Home() {
  const navigate = useNavigate();
  const [playingSong, setPlayingSong] = useState<string>();
  const [path, setPath] = usePath();
  const [keyword, setKeyword] = useKeyword();

  // Queries
  const { isLoading, refetch, data } = useQuery(
    ["playList", getPath(path)],
    api.playlist,
    {
      enabled: false,
    }
  );
  /**
   * 폴더클릭시 재조회
   */
  useEffect(() => {
    // if (directory) {
    // console.log("path", path);
    refetch();
    // }
  }, [path]);

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
  const onClickDir = (dir: string) => {
    // console.log(dir);
    return setPath((prev: string[]) => [...prev, dir]);
  };

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

  // 검색
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newWord = event.currentTarget.value;
    setKeyword(newWord);
  };

  const onSearchClick = () => {
    navigate(`/search`);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearchClick();
  };
  /**
   * render
   */
  return (
    <div className="container flex flex-col w-screen h-screen mx-auto items-center bg-slate-700 text-gray-300">
      <header className="my-6 text-2xl font-bold">오감별 음악</header>
      <Player playingSong={playingSong} path={getPath(path)} />
      <form
        onSubmit={onSubmit}
        className="flex flex-col justify-center items-center mt-4"
      >
        <div className="relative">
          <input
            className="py-1 pl-2 pr-8 rounded-md text-gray-800 w-60"
            type="text"
            value={keyword}
            onChange={onChange}
            placeholder="노래제목을 입력하세요"
            autoFocus={true}
            // ref={inputKeywordRef}
          />
          <SearchIcon
            className="h-8 p-1 text-gray-300 absolute top-0 right-0 cursor-pointer"
            onClick={onSearchClick}
          />
        </div>
      </form>
      <div className="self-start px-4">
        <button onClick={onClickBack}>
          <FcLeft size={40} color={"red"} />
        </button>
      </div>
      <div className="self-start flex flex-row flex-wrap px-4 text-lg text-amber-400">
        {/* {getPath(path).replaceAll("/", " / ")} */}
        {getPath(path)
          .split("/")
          .map((name, idx) => (
            <Fragment key={idx}>
              <span>{name}</span>
              {getPath(path).split("/").length > idx + 1 && (
                <ChevronRightIcon className="h-7" />
              )}
            </Fragment>
          ))}
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
