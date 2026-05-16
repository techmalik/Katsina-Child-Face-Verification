import { spawn } from "child_process";
import path from "path";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  if (process.env["NODE_ENV"] === "production") {
    const faceServiceDir = path.resolve(process.cwd(), "artifacts/face-service");
    const faceServicePort = process.env["FACE_SERVICE_URL"]?.split(":").pop() ?? "8001";

    logger.info({ faceServiceDir, faceServicePort }, "Spawning face embedding service");

    const child = spawn("bash", ["start.sh"], {
      cwd: faceServiceDir,
      env: { ...process.env, PORT: faceServicePort },
      stdio: "pipe",
    });

    child.stdout.on("data", (data: Buffer) => {
      logger.info({ service: "face-service" }, data.toString().trimEnd());
    });

    child.stderr.on("data", (data: Buffer) => {
      logger.error({ service: "face-service" }, data.toString().trimEnd());
    });

    child.on("exit", (code, signal) => {
      logger.warn({ code, signal }, "Face embedding service exited");
    });

    process.on("SIGTERM", () => {
      logger.info("SIGTERM received — shutting down face service");
      child.kill("SIGTERM");
    });
  }
});
