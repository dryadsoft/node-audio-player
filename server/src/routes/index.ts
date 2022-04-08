import express, { Request, Response } from "express";
import { getDirectorys } from "../services/indexService";
import path from "path";
const router = express.Router();
const BASIC_MUSIC_PATH = "../../music/songs";

// router.get("/", (req: Request, res: Response) => {
//   res.render("index");
// });

router.get("/playlist", async (req: Request, res: Response) => {
  let musicPath = BASIC_MUSIC_PATH;
  if (req.query.dir !== "") {
    musicPath = `${musicPath}/${req.query.dir}`;
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
  res.json({ directory: dirs, playlist: files });
  res.end();
});
export default router;
