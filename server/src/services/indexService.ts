import { promises as fs } from "fs";
import path from "path";

const BASIC_MUSIC_PATH = "../../music/songs";
interface IGetDirectorysProps {
  path: string;
  type: "f" | "d";
}

export const playlist = async (dir: string) => {
  let musicPath = BASIC_MUSIC_PATH;
  if (dir !== "") {
    musicPath = `${musicPath}/${dir}`;
  }
  const dirs = await getDirectorys({
    path: path.join(__dirname, musicPath),
    type: "d",
  });
  const files = await getDirectorys({
    path: path.join(__dirname, musicPath),
    type: "f",
  });
  // res.writeHead(200, { "Content-Type": "application/json" });
  return { directory: dirs, playlist: files.filter((music) => music.name !== ".gitkeep") };
};
/**
 * @param type d: 디렉토리, f: file
 */
const getDirectorys = async ({ path, type }: IGetDirectorysProps) => {
  const types = { f: 1, d: 2 };
  const dirs = await fs.readdir(path, {
    encoding: "utf-8",
    withFileTypes: true,
  });

  const filteredDirectorys = dirs.filter(
    (obj: any) => obj[Object.getOwnPropertySymbols(obj)[0]] === types[type]
  );
  return filteredDirectorys;
};
