import fs from "fs/promises";

interface IGetDirectorysProps {
  path: string;
  type: "f" | "d";
}
/**
 * @param type d: 디렉토리, f: file
 */
export const getDirectorys = async ({ path, type }: IGetDirectorysProps) => {
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
