import express, { Request, Response } from "express";
import { playlist } from "../services/indexService";
const router = express.Router();

router.get("/playlist", async (req: Request, res: Response) => {
  const dir = req.query.dir as string;
  const result = await playlist(dir);
  // res.writeHead(200, { "Content-Type": "application/json" });
  res.json(result);
  res.end();
});
export default router;
