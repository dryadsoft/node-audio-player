import createError from "http-errors";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import logger from "morgan";
import helmet from "helmet";
import indexRouter from "./routes";

const app = express();
// const CLIENT_PATH = "../../client/build";
// app.set("views", path.join(__dirname, CLIENT_PATH));
// app.set("view engine", "html");
app.use(helmet());
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
// app.use(express.static(path.join(__dirname, "client/public")));
app.use(express.static(path.join(__dirname, "../music")));
// app.use(express.static(path.join(__dirname, CLIENT_PATH)));

app.use("/api", indexRouter);
// app.get("*", (req, res) => {
//   res.sendfile(path.join(__dirname, CLIENT_PATH, "index.html"));
// });
// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err: any, req: Request, res: Response, next: NextFunction) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

export default app;
