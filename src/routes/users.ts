import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const usersRouter = Router();

usersRouter.post("/users/register", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress || typeof walletAddress !== "string") {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    const existing = await db.select().from(usersTable).where(eq(usersTable.walletAddress, walletAddress)).limit(1);
    if (existing.length > 0) {
      return res.json({ id: existing[0].id, walletAddress, isNew: false });
    }

    const id = randomUUID();
    await db.insert(usersTable).values({ id, walletAddress });
    return res.json({ id, walletAddress, isNew: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to register user" });
  }
});

export default usersRouter;
