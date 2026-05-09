import { Router, type IRouter } from "express";
import healthRouter from "./health";
import verifyRouter from "./verify";
import childrenRouter from "./children";
import verificationsRouter from "./verifications";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/verify", verifyRouter);
router.use("/children", childrenRouter);
router.use("/verifications", verificationsRouter);
router.use(statsRouter);

export default router;
