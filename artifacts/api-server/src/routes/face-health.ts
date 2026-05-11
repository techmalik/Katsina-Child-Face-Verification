import { Router, type IRouter } from "express";
import { getFaceServiceUrl } from "../lib/config";

const router: IRouter = Router();

router.get("/face-health", async (_req, res) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${getFaceServiceUrl()}/health`, {
      signal: controller.signal,
    });
    if (response.ok) {
      res.json({ status: "ok", face_service: "reachable" });
    } else {
      res.status(502).json({ status: "degraded", face_service: "unhealthy", http_status: response.status });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(503).json({ status: "degraded", face_service: "unreachable", error: message });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
