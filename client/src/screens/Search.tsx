import { SearchIcon } from "@heroicons/react/outline";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { FcLeft, FcMusic, FcHome, FcFolder } from "react-icons/fc";
import { useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import Loading from "../components/Loading";
import Player from "../components/Player";
import { useKeyword, usePath } from "../context/context";

const Search = () => {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useKeyword();
  const [_, setPath] = usePath();
  const [playingSong, setPlayingSong] = useState<string>();

  const { isLoading, refetch, data } = useQuery(
    ["search", keyword],
    api.search,
    { enabled: false }
  );
  /**
   * init
   */
  useEffect(() => {
    if (keyword) {
      refetch();
    }
  }, []);

  /**
   * 노래 클릭이벤트
   * @param song
   * @returns
   */
  const onClickPlaylist = (song: string) => setPlayingSong(song);

  // 검색
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    // event.preventDefault();
    const newWord = event.currentTarget.value;
    setKeyword(newWord);
  };

  /**
   * 검색 아이콘 클릭
   */
  const onSearchClick = () => {
    refetch();
  };

  /**
   * form객체 submit
   * @param event
   */
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearchClick();
  };

  /**
   * go Home
   */
  const goHome = (path = "") => {
    setPath(["", ...path.split("/")]);
    navigate("/");
  };

  /**
   * getPath
   * @param fullPath
   * @returns
   */
  const getPath = (fullPath?: string) => {
    return fullPath?.substring(0, fullPath.lastIndexOf("/"));
  };
  /**
   * getSongName
   * @param fullPath
   * @returns
   */
  const getSongName = (fullPath?: string) => {
    return fullPath?.substring(fullPath.lastIndexOf("/") + 1);
  };

  if (isLoading) {
    return <Loading />;
  }
  /**
   * render
   */
  return (
    <div className="container flex flex-col w-screen h-screen mx-auto items-center bg-slate-700 text-gray-300">
      <header className="my-6 text-2xl font-bold">오감별 음악</header>
      <Player
        playingSong={getSongName(playingSong)}
        path={getPath(playingSong)}
      />
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
        <button onClick={() => goHome("")}>
          <FcHome size={30} color={"red"} />
        </button>
      </div>
      <div className="overflow-y-auto self-start w-full px-4 text-base ">
        {data &&
          data.map((song: string, idx: number) => (
            <div
              key={idx}
              className="truncate odd:bg-slate-900 even:bg-slate-800  rounded-sm cursor-pointer hover:bg-slate-400 hover:text-slate-800 p-2"
              onClick={() => onClickPlaylist(song)}
            >
              <FcMusic className="inline-block mr-1" /> {getSongName(song)}
              <div
                className="text-orange-300 mt-2"
                onClick={() => goHome(getPath(song))}
              >
                <FcFolder className="inline-block mr-2" />
                {getPath(song)?.replaceAll("/", " > ")}
              </div>
            </div>
          ))}
      </div>
      <footer className="mt-10">Copyright © 2022 Dryadsoft</footer>
    </div>
  );
};

export default Search;
