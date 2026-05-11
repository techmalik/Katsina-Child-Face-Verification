import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use("/api", router);

if (process.env["NODE_ENV"] === "production") {
  const distDir = path.resolve(
    process.cwd(),
    "artifacts/verification-app/dist/public",
  );
  app.use(express.static(distDir));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

export default app;
