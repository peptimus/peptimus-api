import { randomBytes, randomUUID } from "crypto";
import bs58 from "bs58";
import { db, usersTable, peptidesTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const RESEARCH_GOALS = [
  "Design an antimicrobial peptide to fight drug-resistant bacterial infections",
  "Create a peptide that promotes wound healing with minimal toxicity",
  "Generate a GLP-1 receptor agonist candidate for metabolic disease research",
  "Design a cell-penetrating peptide for intracellular drug delivery",
  "Optimize a peptide inhibitor targeting cancer cell growth",
  "Develop a blood-brain barrier crossing peptide for CNS drug delivery",
  "Design a peptide that selectively kills melanoma cells",
  "Create an anti-inflammatory peptide for arthritis treatment",
  "Develop a peptide vaccine adjuvant for enhanced immune response",
  "Design a peptide inhibitor of VEGF for anti-angiogenic therapy",
  "Create a peptide targeting PCSK9 for cholesterol reduction",
  "Design a peptide agonist for the glucagon receptor in type 2 diabetes",
  "Generate a peptide that promotes bone regeneration via BMP pathway",
  "Design a peptide inhibitor of amyloid beta aggregation for Alzheimer's",
  "Create a short antimicrobial peptide with high selectivity for fungi",
  "Develop a cardiovascular peptide targeting ACE2 receptor",
  "Design a peptide that activates innate immunity against viral infections",
  "Create a photosensitizer-conjugated peptide for photodynamic cancer therapy",
  "Develop a peptide hormone analogue for growth hormone deficiency",
  "Design a self-assembling peptide hydrogel for tissue engineering scaffolds",
];

// ─── Daily budget state ────────────────────────────────────────────────────
let dailyMintBudget = 0;
let mintsToday = 0;
let mintTimer: ReturnType<typeof setTimeout> | null = null;

function pickDailyBudget(): number {
  return Math.floor(Math.random() * 251) + 600; // 600–850
}

function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

function resetDaily(): void {
  dailyMintBudget = pickDailyBudget();
  mintsToday = 0;
  console.log(`[simulator] daily reset — budget: ${dailyMintBudget} mints today`);
  scheduleNextMint();

  // Schedule next reset at midnight
  setTimeout(() => resetDaily(), msUntilMidnight());
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function generateSolanaWallet(): string {
  return bs58.encode(randomBytes(32));
}

function parseJson<T>(raw: string, fallback: T): T {
  let s = raw.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/im, "").trim();
  const start = s.indexOf("[") !== -1 ? s.indexOf("[") : s.indexOf("{");
  const end = s.lastIndexOf("]") !== -1 ? s.lastIndexOf("]") : s.lastIndexOf("}");
  if (start !== -1 && end !== -1) s = s.slice(start, end + 1);
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

// ─── Core actions ──────────────────────────────────────────────────────────
async function generatePeptidesForWallet(walletAddress: string, goal: string): Promise<string[]> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `You are a peptide design AI. Given a research goal, output ONLY a JSON array of 4 peptide variants, no markdown:
[{"sequence":"KWKLFKK","affinity":88,"stability":82,"novelty":75,"toxicity":6,"evolutionScore":87,"therapeuticArea":"Anti-infective","rationale":"1-2 sentences","mechanism":"short phrase","keyFeatures":["Cationic","Alpha-helical"]}]
Rules: sequence 8-20 chars from ACDEFGHIKLMNPQRSTVWY only, affinity/stability 60-99, novelty 50-99, toxicity 0-25, evolutionScore 70-99.`,
        },
        {
          role: "user",
          content: `Research goal: ${goal}. Generate 4 unique de novo peptide sequences. Return JSON array only.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const aiVariants = parseJson<any[]>(raw, []);
    if (!Array.isArray(aiVariants) || aiVariants.length === 0) return [];

    const variants = aiVariants.slice(0, 4).map((v: any) => ({
      id: `sim-${randomUUID().substring(0, 8)}`,
      sequence: String(v.sequence ?? "KWKLFKK").toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, "").slice(0, 20) || "KWKLFKK",
      seedSequence: goal.slice(0, 60),
      affinity: Math.min(99, Math.max(60, Number(v.affinity) || 78)),
      stability: Math.min(99, Math.max(60, Number(v.stability) || 76)),
      novelty: Math.min(99, Math.max(50, Number(v.novelty) || 72)),
      toxicity: Math.min(25, Math.max(0, Number(v.toxicity) || 10)),
      evolutionScore: Math.min(99, Math.max(70, Number(v.evolutionScore) || 82)),
      therapeuticArea: typeof v.therapeuticArea === "string" ? v.therapeuticArea : null,
      rationale: typeof v.rationale === "string" ? v.rationale : null,
      mechanism: typeof v.mechanism === "string" ? v.mechanism : null,
      keyFeatures: Array.isArray(v.keyFeatures) && v.keyFeatures.length > 0 ? v.keyFeatures : null,
      creatorWallet: walletAddress,
    }));

    await db.insert(peptidesTable).values(variants);
    console.log(`[simulator] wallet ${walletAddress.slice(0, 8)}… → ${variants.length} peptides inserted`);
    return variants.map((v) => v.id);
  } catch (err) {
    console.error(`[simulator] peptide gen failed:`, err);
    return [];
  }
}

async function mintPeptideNFT(peptideId: string, walletAddress: string): Promise<void> {
  const MERKLE_TREE_ADDRESS = process.env.MERKLE_TREE_ADDRESS;
  const PLATFORM_KEY = process.env.PLATFORM_WALLET_PRIVATE_KEY;
  const HELIUS_API_KEY = process.env.HELIUS_API_KEY ?? "";

  if (!MERKLE_TREE_ADDRESS || !PLATFORM_KEY) return;

  try {
    const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults");
    const { keypairIdentity, none, some, publicKey: umiPublicKey } = await import("@metaplex-foundation/umi");
    const { mintV1, mplBubblegum, findLeafAssetIdPda, fetchTreeConfigFromSeeds } = await import("@metaplex-foundation/mpl-bubblegum");

    const rpc = HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
      : "https://api.mainnet-beta.solana.com";

    const umi = createUmi(rpc).use(mplBubblegum());
    const secretKey = bs58.decode(PLATFORM_KEY);
    umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secretKey)));

    const merkleTree = umiPublicKey(MERKLE_TREE_ADDRESS);
    const treeConfig = await fetchTreeConfigFromSeeds(umi, { merkleTree });
    const leafIndex = Number(treeConfig.numMinted);
    const [assetId] = findLeafAssetIdPda(umi, { merkleTree, leafIndex });

    const domains = process.env.APP_DOMAIN ?? process.env.HOST ?? "localhost";
    const apiDomain = domains.split(",")[0].trim();
    const metadataUri = `https://${apiDomain}/api/peptides/${peptideId}/metadata`;

    await mintV1(umi, {
      leafOwner: umiPublicKey(walletAddress),
      merkleTree,
      metadata: {
        name: `Peptimus BioNFT · ${peptideId}`,
        symbol: "BIONFT",
        uri: metadataUri,
        sellerFeeBasisPoints: 500,
        collection: none(),
        creators: [],
        isMutable: false,
        primarySaleHappened: false,
        editionNonce: none(),
        tokenStandard: some(0),
        uses: none(),
        tokenProgramVersion: 0,
      },
    }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

    const mintAddress = assetId.toString();
    const { eq } = await import("drizzle-orm");
    await db.update(peptidesTable).set({ mintAddress, creatorWallet: walletAddress }).where(eq(peptidesTable.id, peptideId));
    console.log(`[simulator] minted NFT ${mintAddress.slice(0, 8)}… for peptide ${peptideId}`);
  } catch (err: any) {
    console.error(`[simulator] mint failed for ${peptideId}:`, err?.message ?? err);
  }
}

// ─── One mint event: generate 1 wallet → 4 peptides → mint 1–4 of them ───
async function doMintEvent(): Promise<number> {
  const wallet = generateSolanaWallet();
  const goal = RESEARCH_GOALS[Math.floor(Math.random() * RESEARCH_GOALS.length)];

  try {
    await db.insert(usersTable).values({ id: randomUUID(), walletAddress: wallet }).onConflictDoNothing();
  } catch {}

  const peptideIds = await generatePeptidesForWallet(wallet, goal);
  if (peptideIds.length === 0) return 0;

  // Mint a random subset (1–4) from this wallet's peptides
  const mintCount = Math.min(peptideIds.length, Math.floor(Math.random() * 4) + 1);
  const toMint = peptideIds.slice(0, mintCount);

  let minted = 0;
  for (const id of toMint) {
    if (!process.env.MERKLE_TREE_ADDRESS) break;
    await mintPeptideNFT(id, wallet);
    minted++;
  }
  return minted;
}

// ─── Scheduler: random gap between mints ──────────────────────────────────
function scheduleNextMint(): void {
  if (mintTimer) clearTimeout(mintTimer);

  if (mintsToday >= dailyMintBudget) {
    console.log(`[simulator] daily budget reached (${mintsToday}/${dailyMintBudget}) — pausing until midnight`);
    return;
  }

  // Average gap = seconds remaining today / mints remaining
  const remainingMs = msUntilMidnight();
  const remainingMints = dailyMintBudget - mintsToday;
  const avgGapMs = Math.max(5_000, remainingMs / remainingMints);

  // Jitter: 0.15× to 2.8× of avg gap for organic feel
  const jitter = 0.15 + Math.random() * 2.65;
  const delayMs = Math.min(avgGapMs * jitter, remainingMs);

  mintTimer = setTimeout(async () => {
    try {
      const minted = await doMintEvent();
      mintsToday += minted;
      console.log(`[simulator] mints today: ${mintsToday}/${dailyMintBudget}`);
    } catch (err) {
      console.error("[simulator] mint event error:", err);
    }
    scheduleNextMint();
  }, delayMs);
}

// ─── Entry point ───────────────────────────────────────────────────────────
export function startSimulator(): void {
  dailyMintBudget = pickDailyBudget();
  mintsToday = 0;

  console.log(`[simulator] started — daily budget: ${dailyMintBudget} mints (random 600–850)`);

  // Schedule first mint soon (5–30s after boot) so there's immediate activity
  const bootDelay = 5_000 + Math.random() * 25_000;
  setTimeout(() => {
    scheduleNextMint();
  }, bootDelay);

  // Reset budget at midnight
  setTimeout(() => resetDaily(), msUntilMidnight());
}
