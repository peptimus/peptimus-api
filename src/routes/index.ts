import { Router, type IRouter } from "express";
import healthRouter from "./health";
import statsRouter from "./stats";
import usersRouter from "./users";
import peptidesRouter from "./peptides";
import feedRouter from "./feed";
import mintRouter from "./mint";

const router: IRouter = Router();

router.use(healthRouter);
router.use(statsRouter);
router.use(usersRouter);
router.use(peptidesRouter);
router.use(feedRouter);
router.use(mintRouter);

export default router;
