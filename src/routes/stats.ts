import { Router } from "express";
import { db } from "@workspace/db";
import { peptidesTable } from "@workspace/db";
import { sql, isNotNull, max } from "drizzle-orm";

const statsRouter = Router();

statsRouter.get("/stats", async (_req, res) => {
  try {
    const [peptideCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(peptidesTable);

    const [nftCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(peptidesTable)
      .where(isNotNull(peptidesTable.mintAddress));

    const [contributors] = await db
      .select({ count: sql<number>`count(distinct creator_wallet)::int` })
      .from(peptidesTable)
      .where(isNotNull(peptidesTable.creatorWallet));

    const [topScoreRow] = await db
      .select({ top: max(peptidesTable.evolutionScore) })
      .from(peptidesTable);

    res.json({
      peptidesGenerated: peptideCount?.count ?? 0,
      ipnftsMinted: nftCount?.count ?? 0,
      contributors: contributors?.count ?? 0,
      topScore: topScoreRow?.top ?? 0,
      modelsRunning: true,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default statsRouter;
