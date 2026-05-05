import { Router } from "express";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  keypairIdentity,
  none,
  some,
  publicKey as umiPublicKey,
} from "@metaplex-foundation/umi";
import {
  mintV1,
  mplBubblegum,
  findLeafAssetIdPda,
  fetchTreeConfigFromSeeds,
} from "@metaplex-foundation/mpl-bubblegum";
import { db, peptidesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { IpnftMeta } from "@workspace/db/schema/peptides";
import bs58 from "bs58";

const mintRouter = Router();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY ?? "";
const MAINNET_RPC = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";

function getPlatformKeypair(umi: ReturnType<typeof createUmi>) {
  const raw = process.env.PLATFORM_WALLET_PRIVATE_KEY;
  if (!raw) throw new Error("PLATFORM_WALLET_PRIVATE_KEY not set");
  return umi.eddsa.createKeypairFromSecretKey(bs58.decode(raw));
}

/**
 * POST /api/peptides/:id/mint-server
 *
 * Gasless Compressed NFT (cNFT) minting via Metaplex Bubblegum.
 * Platform wallet is the fee payer (~0.000001 SOL per mint).
 * NFT (Molecule IP-NFT standard) is owned by userWallet.
 *
 * Requires env:
 *   PLATFORM_WALLET_PRIVATE_KEY  — bs58 keypair, must hold SOL
 *   MERKLE_TREE_ADDRESS          — created once via scripts/create-tree.mjs
 *
 * Future (after $PTMS launch): add 100 PTMS gate here.
 */
mintRouter.post("/peptides/:id/mint-server", async (req, res) => {
  try {
    const { userWallet } = req.body as { userWallet?: string };
    if (!userWallet) return res.status(400).json({ error: "userWallet is required" });

    const [peptide] = await db.select().from(peptidesTable).where(eq(peptidesTable.id, req.params.id));
    if (!peptide) return res.status(404).json({ error: "Peptide not found" });

    if (peptide.mintAddress) {
      return res.json({ mintAddress: peptide.mintAddress, assetId: peptide.mintAddress, alreadyMinted: true });
    }

    if (!process.env.PLATFORM_WALLET_PRIVATE_KEY) {
      return res.status(503).json({ error: "Platform minting wallet not configured" });
    }

    const MERKLE_TREE_ADDRESS = process.env.MERKLE_TREE_ADDRESS;
    if (!MERKLE_TREE_ADDRESS) {
      return res.status(503).json({
        error: "Merkle tree not initialised. Run: node artifacts/api-server/scripts/create-tree.mjs",
      });
    }

    const umi = createUmi(MAINNET_RPC).use(mplBubblegum());
    umi.use(keypairIdentity(getPlatformKeypair(umi)));

    const domains = process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? "localhost";
    const apiDomain = domains.split(",")[0].trim();
    const metadataUri = `https://${apiDomain}/api/peptides/${peptide.id}/metadata`;

    const ipnft = peptide.ipnftMeta as IpnftMeta | null;
    const area = ipnft?.therapeuticArea ?? "Research";
    const nftName = `Peptimus IP-NFT · ${area} · ${peptide.sequence.substring(0, 8)}`;

    const merkleTree = umiPublicKey(MERKLE_TREE_ADDRESS);

    // Read current numMinted to deterministically compute the incoming assetId.
    const treeConfig = await fetchTreeConfigFromSeeds(umi, { merkleTree });
    const leafIndex = Number(treeConfig.numMinted);
    const [assetId] = findLeafAssetIdPda(umi, { merkleTree, leafIndex });

    // Mint the cNFT — platform wallet pays, NFT lands in userWallet.
    await mintV1(umi, {
      leafOwner: umiPublicKey(userWallet),
      merkleTree,
      metadata: {
        name: nftName,
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

    await db
      .update(peptidesTable)
      .set({ mintAddress, creatorWallet: userWallet })
      .where(eq(peptidesTable.id, peptide.id));

    return res.json({ mintAddress, assetId: mintAddress, alreadyMinted: false });
  } catch (err: any) {
    console.error("cNFT mint error:", err);
    return res.status(500).json({ error: err?.message ?? "Minting failed" });
  }
});

export default mintRouter;
