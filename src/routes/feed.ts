import { Router } from "express";
import { db } from "@workspace/db";
import { peptidesTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const feedRouter = Router();

feedRouter.get("/feed", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: peptidesTable.id,
        sequence: peptidesTable.sequence,
        seedSequence: peptidesTable.seedSequence,
        evolutionScore: peptidesTable.evolutionScore,
        affinity: peptidesTable.affinity,
        stability: peptidesTable.stability,
        novelty: peptidesTable.novelty,
        toxicity: peptidesTable.toxicity,
        creatorWallet: peptidesTable.creatorWallet,
        mintAddress: peptidesTable.mintAddress,
        therapeuticArea: peptidesTable.therapeuticArea,
        mechanism: peptidesTable.mechanism,
        createdAt: peptidesTable.createdAt,
      })
      .from(peptidesTable)
      .orderBy(desc(peptidesTable.createdAt))

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch feed" });
  }
});

export default feedRouter;
