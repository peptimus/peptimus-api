import { Router } from "express";
import { db, peptidesTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { randomUUID, createHash } from "crypto";
import { eq, desc, or, ilike, sql } from "drizzle-orm";
import type { IpnftMeta } from "@workspace/db/schema/peptides";
import { Resvg } from "@resvg/resvg-js";
import { LOGO_PNG_B64 } from "../assets/logo";

const peptidesRouter = Router();

const AMINO_ACIDS = "ACDEFGHIKLMNPQRSTVWY";

function mutateSequence(seed: string, numMutations: number): string {
  const seq = seed.split("");
  for (let i = 0; i < numMutations; i++) {
    const idx = Math.floor(Math.random() * seq.length);
    seq[idx] = AMINO_ACIDS[Math.floor(Math.random() * AMINO_ACIDS.length)];
  }
  return seq.join("");
}

peptidesRouter.post("/peptides/evolve", async (req, res) => {
  try {
    const { seed, creatorWallet } = req.body as { seed: string; creatorWallet?: string };
    if (!seed || typeof seed !== "string") {
      return res.status(400).json({ error: "seed is required" });
    }

    const upperSeed = seed.toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, "");
    if (upperSeed.length < 3) {
      return res.status(400).json({ error: "Seed must contain at least 3 valid amino acid characters" });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `You are a computational biochemistry AI specialized in peptide evolution. 
Given a seed amino acid sequence, generate 6 optimized peptide variants with realistic predicted properties.
Each variant should have 1-3 point mutations from the seed.
Respond ONLY with a valid JSON array (no markdown) with this exact structure:
[{"sequence":"...","affinity":85,"stability":78,"novelty":72,"toxicity":5,"evolutionScore":88}]
- sequence: mutated amino acid sequence (same length as seed, only letters ACDEFGHIKLMNPQRSTVWY)
- affinity: binding affinity score 60-99
- stability: structural stability score 60-99  
- novelty: novelty compared to known peptides 50-99
- toxicity: predicted toxicity 0-25 (lower is better)
- evolutionScore: overall evolution score 70-99`,
        },
        {
          role: "user",
          content: `Seed sequence: ${upperSeed}\nGenerate 6 optimized variants.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "[]";
    let aiVariants: any[] = [];
    try {
      aiVariants = JSON.parse(content);
    } catch {
      aiVariants = [];
    }

    if (!Array.isArray(aiVariants) || aiVariants.length === 0) {
      aiVariants = Array.from({ length: 6 }, () => ({
        sequence: mutateSequence(upperSeed, Math.floor(Math.random() * 3) + 1),
        affinity: Math.floor(Math.random() * 40) + 60,
        stability: Math.floor(Math.random() * 40) + 60,
        novelty: Math.floor(Math.random() * 50) + 50,
        toxicity: Math.floor(Math.random() * 25),
        evolutionScore: Math.floor(Math.random() * 30) + 70,
      }));
    }

    const variants = aiVariants.map((v: any) => ({
      id: `var-${randomUUID().substring(0, 8)}`,
      sequence: String(v.sequence || mutateSequence(upperSeed, 1)).toUpperCase(),
      affinity: Math.min(99, Math.max(60, Number(v.affinity) || 75)),
      stability: Math.min(99, Math.max(60, Number(v.stability) || 75)),
      novelty: Math.min(99, Math.max(50, Number(v.novelty) || 70)),
      toxicity: Math.min(25, Math.max(0, Number(v.toxicity) || 10)),
      evolutionScore: Math.min(99, Math.max(70, Number(v.evolutionScore) || 80)),
    }));

    await db.insert(peptidesTable).values(
      variants.map((v) => ({
        id: v.id,
        sequence: v.sequence,
        seedSequence: upperSeed,
        affinity: v.affinity,
        stability: v.stability,
        novelty: v.novelty,
        toxicity: v.toxicity,
        evolutionScore: v.evolutionScore,
        creatorWallet: creatorWallet ?? null,
      }))
    );

    return res.json({ variants });
  } catch (err) {
    console.error("Evolve error:", err);
    return res.status(500).json({ error: "Failed to evolve peptide" });
  }
});

function parseJson<T>(raw: string, fallback: T): T {
  let s = raw.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/im, "").trim();
  const start = s.indexOf("{") !== -1 ? s.indexOf("{") : s.indexOf("[");
  const end = s.lastIndexOf("}") !== -1 ? s.lastIndexOf("}") : s.lastIndexOf("]");
  if (start !== -1 && end !== -1) s = s.slice(start, end + 1);
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function inferContext(goal: string): {
  therapeuticArea: string; targetMechanism: string; designStrategy: string; sequences: string[];
  rationales: string[]; mechanisms: string[]; featureSets: string[][];
} {
  const g = goal.toLowerCase();
  if (g.includes("antimicrobial") || g.includes("bacteria") || g.includes("antibiotic") || g.includes("infection")) {
    return {
      therapeuticArea: "Anti-infective",
      targetMechanism: "membrane disruption",
      designStrategy: "Cationic amphipathic helices exploit electrostatic attraction to anionic bacterial membranes, causing physical disruption without requiring specific receptors—reducing resistance risk.",
      sequences: ["KWKLFKKIGAVLKVL","RRRPRPPYLPRPRP","GIGKFLHSAKKFGK","ACYCRIPACIAGERR","KLAKLAKKLAKLAK","FLPVLAGGIAAKVIP"],
      rationales: [
        "This cationic amphipathic helix mimics magainin-class AMPs; the lysine-tryptophan backbone promotes membrane insertion while minimising mammalian cell toxicity.",
        "Poly-arginine stretch provides strong electrostatic binding to Gram-negative LPS; the proline kink disrupts beta-sheet aggregation for better solubility.",
        "Inspired by GIGKFLHS scaffold of magainin-2; the phenylalanine cluster drives hydrophobic insertion into the lipid bilayer at physiological pH.",
        "Cysteine pairs allow disulfide-bridged cyclic conformation, increasing protease resistance while retaining membrane-active properties.",
        "Repeating KLAK motif induces mitochondrial membrane disruption selectively in bacteria due to differences in membrane potential.",
        "Leucine-rich hydrophobic core flanked by lysines creates a carpet-mechanism peptide that tiles and solubilises the outer bacterial membrane.",
      ],
      mechanisms: ["membrane disruption","electrostatic binding + pore formation","lipid bilayer insertion","disulfide-stabilised membrane binding","mitochondria-targeted lysis","carpet mechanism"],
      featureSets: [
        ["Cationic","Alpha-helical","Amphipathic","Membrane-active"],
        ["Cationic","Cell-penetrating","Flexible","Linear"],
        ["Alpha-helical","Hydrophobic","Amphipathic","Membrane-active"],
        ["Cyclic","Disulfide","Cationic","Rigid"],
        ["Cationic","Membrane-active","Linear","Amphipathic"],
        ["Hydrophobic","Alpha-helical","Amphipathic","Membrane-active"],
      ],
    };
  }
  if (g.includes("wound") || g.includes("healing") || g.includes("regenerat") || g.includes("skin")) {
    return {
      therapeuticArea: "Regenerative",
      targetMechanism: "growth factor receptor agonism",
      designStrategy: "Short peptide mimetics of growth factor binding domains (EGF, PDGF) activate keratinocyte and fibroblast proliferation pathways to accelerate wound closure.",
      sequences: ["KGHK","RDGS","IKVAV","YIGSR","GFOGER","PHSRN"],
      rationales: [
        "KGHK mimics the copper-binding domain of albumin, promoting angiogenesis and collagen synthesis in dermal wounds.",
        "RGD-serine motif enhances integrin-mediated cell adhesion and migration, critical for re-epithelialisation.",
        "IKVAV laminin sequence drives neurite outgrowth and stem cell differentiation, accelerating neural component repair.",
        "YIGSR is a laminin-1 derived sequence that promotes keratinocyte adhesion and basement membrane reconstitution.",
        "Collagen-mimetic GFOGER engages alpha2beta1 integrins to promote fibroblast spreading and matrix deposition.",
        "PHSRN synergises with RGD to enhance fibronectin-type integrin binding for full adhesive signalling.",
      ],
      mechanisms: ["copper-mediated angiogenesis","integrin-mediated adhesion","laminin receptor activation","keratinocyte adhesion","collagen receptor engagement","fibronectin synergy domain"],
      featureSets: [
        ["Hydrophilic","Linear","Flexible","Cell-penetrating"],
        ["Hydrophilic","Linear","Cell-penetrating","Flexible"],
        ["Alpha-helical","Hydrophilic","Linear","Flexible"],
        ["Hydrophilic","Linear","Flexible","Amphipathic"],
        ["Rigid","Linear","Hydrophilic","Beta-sheet"],
        ["Hydrophilic","Linear","Flexible","Amphipathic"],
      ],
    };
  }
  if (g.includes("cancer") || g.includes("oncol") || g.includes("tumor") || g.includes("tumour") || g.includes("anti-tumor")) {
    return {
      therapeuticArea: "Oncology",
      targetMechanism: "apoptosis induction",
      designStrategy: "BH3-mimetic and cell-penetrating peptides target Bcl-2 family proteins to restore apoptotic signalling in cancer cells with minimal off-target effects.",
      sequences: ["KLAKLAKKLAKLAK","CALIAPVAL","RQIKIWFQNRRMKWKK","RRWWCRR","CALNN","KRAAKVKAAK"],
      rationales: [
        "KLAK repeats selectively disrupt mitochondrial membranes in cancer cells, which have higher negative membrane potential than healthy cells.",
        "Survivin-BIR domain mimetic that displaces IAP-caspase interactions, re-enabling apoptosis in therapy-resistant cells.",
        "Penetratin scaffold delivers apoptotic cargo across the plasma membrane; the tryptophan residues assist endosomal escape.",
        "Tryptophan-rich cationic sequence combines membrane selectivity with DNA intercalation to block replication in rapidly dividing cells.",
        "Minimal BH3-like domain disrupts Bcl-2/Bax heterodimerisation, restoring the mitochondrial apoptosis pathway.",
        "Cationic amphipathic design targets negatively charged phosphatidylserine-exposed cancer cell membranes selectively.",
      ],
      mechanisms: ["mitochondrial membrane disruption","IAP displacement","cell-penetrating apoptosis delivery","DNA intercalation","Bcl-2 disruption","phosphatidylserine targeting"],
      featureSets: [
        ["Cationic","Membrane-active","Amphipathic","Linear"],
        ["Hydrophobic","Alpha-helical","Rigid","Linear"],
        ["Cell-penetrating","Cationic","Alpha-helical","Flexible"],
        ["Cationic","Amphipathic","Hydrophobic","Linear"],
        ["Alpha-helical","Hydrophobic","Rigid","Linear"],
        ["Cationic","Amphipathic","Alpha-helical","Membrane-active"],
      ],
    };
  }
  if (g.includes("glp") || g.includes("metabol") || g.includes("diabet") || g.includes("insulin") || g.includes("obesity")) {
    return {
      therapeuticArea: "Metabolic",
      targetMechanism: "GLP-1 receptor agonism",
      designStrategy: "Alpha-helical peptide analogues of GLP-1(7-36) with backbone modifications at DPP-IV cleavage sites to extend half-life while maintaining receptor engagement.",
      sequences: ["HAEGTFTSDVSSYLEGQAAKEFIAWLVKGR","HSEGFTSDVSSYLER","HXEGTFTSDVSSYLE","AIBHAEGTFTS","HAEGTFCSDVSS","CAEGTFTSDVSS"],
      rationales: [
        "Full-length GLP-1 analogue with C-terminal extension for albumin binding, dramatically extending plasma half-life over native GLP-1.",
        "Truncated GLP-1 core binding sequence; the leucine-to-arginine substitution improves receptor selectivity over GIP receptor.",
        "Alpha-aminoisobutyric acid substitution at position 2 blocks DPP-IV cleavage, the primary inactivation mechanism of native GLP-1.",
        "N-terminal truncation retains receptor engagement; backbone methylation at Ala-2 provides protease resistance.",
        "Cysteine substitution at position 7 allows site-specific PEGylation or fatty acid conjugation for extended circulation.",
        "N-terminal capping with a cysteine allows disulfide cyclisation that locks the alpha-helical conformation for improved receptor binding.",
      ],
      mechanisms: ["GLP-1 receptor agonism","receptor subtype selectivity","DPP-IV resistance","protease-resistant agonism","site-specific conjugation","conformational stabilisation"],
      featureSets: [
        ["Alpha-helical","Amphipathic","Hydrophilic","Linear"],
        ["Alpha-helical","Hydrophilic","Linear","Flexible"],
        ["Alpha-helical","Rigid","Hydrophilic","Linear"],
        ["Alpha-helical","Hydrophilic","Rigid","Linear"],
        ["Alpha-helical","Hydrophilic","Flexible","Linear"],
        ["Cyclic","Alpha-helical","Rigid","Hydrophilic"],
      ],
    };
  }
  if (g.includes("brain") || g.includes("neuro") || g.includes("bbb") || g.includes("cns") || g.includes("blood-brain")) {
    return {
      therapeuticArea: "Neurology",
      targetMechanism: "blood-brain barrier transcytosis",
      designStrategy: "Low-density lipoprotein receptor-related protein (LRP1) ligand peptides shuttle cargo across the blood-brain barrier via receptor-mediated endocytosis.",
      sequences: ["HAIYPRH","TGNYKALHPHNG","CRGRRPPC","RRRRRRRR","SVSVGMKPSPRP","APEGEDVHAVSGRAGVYIFAHLDIYKSLKCELNDPK"],
      rationales: [
        "HAIYPRH engages transferrin receptor (TfR1) on brain endothelial cells, exploiting the iron transport pathway for CNS drug delivery.",
        "Phage-display-derived sequence with high specificity for LRP1; triggers clathrin-mediated endocytosis without disrupting tight junctions.",
        "Cyclic RGD-like peptide binds to integrin αvβ3 overexpressed on activated brain endothelium, enabling inflammation-targeted CNS entry.",
        "Poly-arginine 8-mer crosses BBB via macropinocytosis; the guanidinium groups interact with heparan sulphate proteoglycans on endothelial cells.",
        "Apo-E receptor binding peptide that mimics the LDL receptor binding domain of Apo-E; clinically validated CNS targeting vector.",
        "Angiopep-2 analogue derived from Kunitz domain; high LRP1 binding affinity enables efficient transcytosis across the BBB.",
      ],
      mechanisms: ["transferrin receptor transcytosis","LRP1-mediated endocytosis","integrin-mediated transcytosis","macropinocytosis","ApoE receptor pathway","Kunitz domain LRP1 transcytosis"],
      featureSets: [
        ["Hydrophilic","Linear","Flexible","Cell-penetrating"],
        ["Hydrophilic","Linear","Flexible","Alpha-helical"],
        ["Cyclic","Rigid","Hydrophilic","Cationic"],
        ["Cationic","Cell-penetrating","Linear","Flexible"],
        ["Alpha-helical","Hydrophilic","Linear","Flexible"],
        ["Alpha-helical","Amphipathic","Linear","Hydrophilic"],
      ],
    };
  }
  return {
    therapeuticArea: "Other",
    targetMechanism: "target-specific binding",
    designStrategy: "De novo sequence generation using structural bioinformatics and evolutionary algorithms to identify optimal sequences for the stated research objective.",
    sequences: ["KWKLFKKIGAVLKVL","RRRPRPPYLPRPRP","GIGKFLHSAKKFGK","ACYCRIPACIAGERR","KLAKLAKKLAKLAK","FLPVLAGGIAAKVIP"],
    rationales: [
      "Amphipathic helix design balances hydrophobic and charged residues for optimal target engagement.",
      "Poly-cationic scaffold provides broad-spectrum binding capacity across multiple target surfaces.",
      "Phenylalanine-rich core enables pi-stacking interactions with aromatic residues in the target binding pocket.",
      "Disulfide-constrained cyclic topology enforces a defined bioactive conformation resistant to proteolysis.",
      "Repeating dipeptide motif derived from combinatorial screening of high-affinity peptide libraries.",
      "Leucine zipper-inspired sequence forms stable coiled-coil interactions with alpha-helical target regions.",
    ],
    mechanisms: ["amphipathic binding","electrostatic target engagement","aromatic pi-stacking","conformationally constrained binding","combinatorial library hit","coiled-coil interaction"],
    featureSets: [
      ["Alpha-helical","Amphipathic","Cationic","Membrane-active"],
      ["Cationic","Cell-penetrating","Flexible","Linear"],
      ["Hydrophobic","Alpha-helical","Amphipathic","Rigid"],
      ["Cyclic","Disulfide","Rigid","Cationic"],
      ["Linear","Flexible","Amphipathic","Cationic"],
      ["Alpha-helical","Hydrophobic","Rigid","Linear"],
    ],
  };
}

peptidesRouter.post("/peptides/design", async (req, res) => {
  try {
    const { goal, creatorWallet } = req.body as { goal: string; creatorWallet?: string };
    if (!goal || typeof goal !== "string" || goal.trim().length < 5) {
      return res.status(400).json({ error: "Please describe your research goal (at least 5 characters)." });
    }

    const ctx = inferContext(goal);

    const [interpretRes, variantRes] = await Promise.allSettled([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 256,
        messages: [
          { role: "system", content: "You are a biochemistry AI. Respond ONLY with a JSON object, no markdown:\n{\"goal\":\"string\",\"therapeuticArea\":\"string\",\"targetMechanism\":\"string\",\"designStrategy\":\"string\"}" },
          { role: "user", content: `Interpret this peptide research goal in 1 sentence each field: ${goal.trim()}` },
        ],
      }),
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 1024,
        messages: [
          { role: "system", content: `You are a peptide design AI. Given a research goal, output ONLY a JSON array of 6 peptide variants, no markdown:\n[{"sequence":"KWKLFKK","affinity":88,"stability":82,"novelty":75,"toxicity":6,"evolutionScore":87,"rationale":"1-2 sentences","mechanism":"short phrase","keyFeatures":["Cationic","Alpha-helical"]}]\nRules: sequence 8-20 chars from ACDEFGHIKLMNPQRSTVWY, affinity/stability 60-99, novelty 50-99, toxicity 0-25, evolutionScore 70-99.` },
          { role: "user", content: `Research goal: ${goal.trim()}. Generate 6 de novo peptide sequences. Return JSON array only.` },
        ],
      }),
    ]);

    let interpretation = {
      goal: goal.trim(),
      therapeuticArea: ctx.therapeuticArea,
      targetMechanism: ctx.targetMechanism,
      designStrategy: ctx.designStrategy,
    };
    if (interpretRes.status === "fulfilled") {
      const raw = interpretRes.value.choices[0]?.message?.content ?? "";
      const p = parseJson<any>(raw, {});
      if (p.goal) interpretation = { ...interpretation, ...p };
    }

    let aiVariants: any[] = [];
    if (variantRes.status === "fulfilled") {
      const raw = variantRes.value.choices[0]?.message?.content ?? "";
      aiVariants = parseJson<any[]>(raw, []);
    }

    const useAI = Array.isArray(aiVariants) && aiVariants.length >= 3;
    const rawVariants = useAI ? aiVariants : ctx.sequences.map((seq, i) => ({
      sequence: seq,
      affinity: 82 + Math.floor(Math.random() * 15),
      stability: 78 + Math.floor(Math.random() * 15),
      novelty: 72 + Math.floor(Math.random() * 20),
      toxicity: 4 + Math.floor(Math.random() * 12),
      evolutionScore: 84 + Math.floor(Math.random() * 13),
      rationale: ctx.rationales[i],
      mechanism: ctx.mechanisms[i],
      keyFeatures: ctx.featureSets[i],
    }));

    const variants = rawVariants.slice(0, 6).map((v: any) => ({
      id: `des-${randomUUID().substring(0, 8)}`,
      sequence: String(v.sequence ?? randomSeq(12)).toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, "").slice(0, 20) || randomSeq(12),
      affinity: Math.min(99, Math.max(60, Number(v.affinity) || 78)),
      stability: Math.min(99, Math.max(60, Number(v.stability) || 76)),
      novelty: Math.min(99, Math.max(50, Number(v.novelty) || 72)),
      toxicity: Math.min(25, Math.max(0, Number(v.toxicity) || 10)),
      evolutionScore: Math.min(99, Math.max(70, Number(v.evolutionScore) || 82)),
      rationale: typeof v.rationale === "string" ? v.rationale : null,
      mechanism: typeof v.mechanism === "string" ? v.mechanism : null,
      keyFeatures: Array.isArray(v.keyFeatures) ? v.keyFeatures : [],
    }));

    const goalSnippet = goal.trim().slice(0, 60);
    await db.insert(peptidesTable).values(
      variants.map((v) => ({
        id: v.id,
        sequence: v.sequence,
        seedSequence: goalSnippet,
        affinity: v.affinity,
        stability: v.stability,
        novelty: v.novelty,
        toxicity: v.toxicity,
        evolutionScore: v.evolutionScore,
        creatorWallet: creatorWallet ?? null,
        therapeuticArea: interpretation.therapeuticArea ?? null,
        rationale: v.rationale ?? null,
        mechanism: v.mechanism ?? null,
        keyFeatures: Array.isArray(v.keyFeatures) && v.keyFeatures.length > 0 ? v.keyFeatures : null,
      }))
    );

    return res.json({ interpretation, variants });
  } catch (err) {
    console.error("Design error:", err);
    return res.status(500).json({ error: "AI design failed. Please try again." });
  }
});

peptidesRouter.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const limit = Math.min(20, parseInt(String(req.query.limit ?? "8"), 10) || 8);
    if (q.length < 2) return res.json([]);
    const pattern = `%${q}%`;
    const rows = await db
      .select()
      .from(peptidesTable)
      .where(
        or(
          ilike(peptidesTable.sequence, pattern),
          ilike(peptidesTable.id, pattern),
          ilike(peptidesTable.seedSequence, pattern),
          ilike(peptidesTable.creatorWallet, pattern),
        )
      )
      .orderBy(desc(peptidesTable.evolutionScore))
      .limit(limit);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Search failed" });
  }
});

peptidesRouter.get("/peptides", async (req, res) => {
  try {
    const { wallet } = req.query as { wallet?: string };
    const rows = wallet
      ? await db.select().from(peptidesTable).where(eq(peptidesTable.creatorWallet, wallet)).orderBy(desc(peptidesTable.createdAt))
      : await db.select().from(peptidesTable).orderBy(desc(peptidesTable.createdAt));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch peptides" });
  }
});

peptidesRouter.get("/peptides/:id", async (req, res) => {
  try {
    const [peptide] = await db.select().from(peptidesTable).where(eq(peptidesTable.id, req.params.id));
    if (!peptide) return res.status(404).json({ error: "Not found" });
    res.json(peptide);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch peptide" });
  }
});

peptidesRouter.get("/peptides/:id/metadata", async (req, res) => {
  try {
    const [peptide] = await db.select().from(peptidesTable).where(eq(peptidesTable.id, req.params.id));
    if (!peptide) return res.status(404).json({ error: "Not found" });

    const domains = process.env.APP_DOMAIN ?? process.env.HOST ?? "localhost";
    const apiDomain = domains.split(",")[0].trim();
    const base = `https://${apiDomain}`;
    const publicBase = "https://peptimus.xyz";
    const imageUrl = `${base}/api/peptides/${peptide.id}/image`;
    const agreementUrl = `${base}/api/peptides/${peptide.id}/agreement`;
    const metadataUrl = `${base}/api/peptides/${peptide.id}/metadata`;

    const contentHash = `sha256:${createHash("sha256").update(peptide.sequence + peptide.id).digest("hex")}`;
    const ipnft = peptide.ipnftMeta as IpnftMeta | null;

    res.json({
      name: `Peptimus IP-NFT · ${ipnft?.therapeuticArea ?? "Research"} · ${peptide.sequence.substring(0, 8)}`,
      symbol: "BIONFT",
      description: `AI-evolved peptide IP-NFT registered on Peptimus Protocol (Molecule IP-NFT standard). Sequence: ${peptide.sequence}. Evolution Score: ${peptide.evolutionScore}/100. Therapeutic Area: ${ipnft?.therapeuticArea ?? "Research"}. Registered on Solana Mainnet.`,
      image: imageUrl,
      external_url: `${publicBase}/app/library`,

      agreements: [
        {
          type: "peptide_research_license",
          url: agreementUrl,
          content_hash: contentHash,
          encrypted: false,
          lit_access_control: null,
          signed_tx_hash: peptide.mintAddress ?? null,
        },
      ],

      project_details: {
        therapeutic_area: ipnft?.therapeuticArea ?? "TBD",
        development_stage: ipnft?.developmentStage ?? "preclinical",
        institution: ipnft?.institution ?? { name: "Independent Research", department: null, country: null },
        researchers: ipnft?.researcherName
          ? [
              {
                name: ipnft.researcherName,
                orcid: ipnft.researcherOrcid ?? null,
                solana_address: peptide.creatorWallet ?? null,
              },
            ]
          : [],
        funding_target_usd: ipnft?.fundingTargetUsd ?? null,
        ip_type: ipnft?.ipType ?? "pre_patent",
        patent_numbers: [],
        data_room: {
          url: metadataUrl,
          public_url: `${publicBase}/app/library`,
          encrypted: false,
          provider: "peptimus",
        },
      },

      chain_references: {
        protocol: "solana",
        chain_id: 101,
        chain_name: "solana-mainnet",
        nft_type: "compressed",
        bubblegum_program: "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY",
        merkle_tree: process.env.MERKLE_TREE_ADDRESS ?? null,
        asset_id: peptide.mintAddress ?? null,
        metadata_standard: "Molecule IP-NFT v2 (Solana cNFT / Bubblegum)",
        molecule_contract_reference: "0xcaD88677CA87a7815728C72D74B4ff4982d54Fc1",
        molecule_standard_url: "https://molecule.xyz/blog/molecules-biopharma-ip-nfts-a-technical-description",
        explorer_url: peptide.mintAddress
          ? `https://explorer.solana.com/address/${peptide.mintAddress}`
          : null,
        website: publicBase,
      },

      attributes: [
        { trait_type: "Sequence", value: peptide.sequence },
        { trait_type: "Seed Sequence", value: peptide.seedSequence },
        { trait_type: "Binding Affinity", value: peptide.affinity },
        { trait_type: "Stability Score", value: peptide.stability },
        { trait_type: "Novelty Index", value: peptide.novelty },
        { trait_type: "Toxicity", value: peptide.toxicity },
        { trait_type: "Evolution Score", value: peptide.evolutionScore },
        { trait_type: "Therapeutic Area", value: ipnft?.therapeuticArea ?? "TBD" },
        { trait_type: "Development Stage", value: ipnft?.developmentStage ?? "preclinical" },
        { trait_type: "IP Type", value: ipnft?.ipType ?? "pre_patent" },
        { trait_type: "Institution", value: ipnft?.institution?.name ?? "Independent" },
        { trait_type: "Protocol Standard", value: "Molecule IP-NFT" },
        { trait_type: "Creator Wallet", value: peptide.creatorWallet ?? "anonymous" },
      ],

      properties: {
        category: "image",
        standard: "Molecule IP-NFT v2",
        nft_type: "compressed",
        chain: "solana-mainnet",
        website: publicBase,
        creators: peptide.creatorWallet ? [{ address: peptide.creatorWallet, share: 100 }] : [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch metadata" });
  }
});

peptidesRouter.get("/peptides/:id/agreement", async (req, res) => {
  try {
    const [peptide] = await db.select().from(peptidesTable).where(eq(peptidesTable.id, req.params.id));
    if (!peptide) return res.status(404).json({ error: "Not found" });

    const ipnft = peptide.ipnftMeta as IpnftMeta | null;
    const contentHash = createHash("sha256").update(peptide.sequence + peptide.id).digest("hex");
    const domains = process.env.APP_DOMAIN ?? process.env.HOST ?? "localhost";
    const apiDomain = domains.split(",")[0].trim();

    res.json({
      agreement_type: "peptide_research_license",
      version: "1.0",
      issued_at: peptide.createdAt,
      asset: {
        id: peptide.id,
        sequence: peptide.sequence,
        seed_sequence: peptide.seedSequence,
        evolution_score: peptide.evolutionScore,
      },
      licensor: {
        protocol: "Peptimus",
        website: "https://peptimus.xyz",
        chain: "solana-mainnet",
        wallet: peptide.creatorWallet ?? null,
      },
      ip_type: ipnft?.ipType ?? "pre_patent",
      therapeutic_area: ipnft?.therapeuticArea ?? "TBD",
      institution: ipnft?.institution ?? null,
      terms: [
        "This peptide sequence and its associated research data are licensed under the Peptimus Decentralized Research License v1.",
        "The holder of the corresponding IP-NFT has exclusive rights to commercialize this peptide compound.",
        "Sub-licensing requires written consent from the original creator or protocol governance.",
        "This agreement is registered on Solana Mainnet with reference to Molecule Protocol IP-NFT standard.",
      ],
      content_hash: `sha256:${contentHash}`,
      mint_address: peptide.mintAddress ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch agreement" });
  }
});

peptidesRouter.get("/peptides/:id/image", async (req, res) => {
  const [peptide] = await db.select({
    sequence: peptidesTable.sequence,
    evolutionScore: peptidesTable.evolutionScore,
    therapeuticArea: peptidesTable.therapeuticArea,
    affinity: peptidesTable.affinity,
    stability: peptidesTable.stability,
  }).from(peptidesTable).where(eq(peptidesTable.id, req.params.id)).catch(() => [null]);

  const seq = (peptide?.sequence ?? "PEPTIDE").toUpperCase();
  const score = peptide?.evolutionScore ?? 80;
  const area = peptide?.therapeuticArea ?? null;
  const id = req.params.id;

  // Therapeutic area → accent color
  const AREA_COLORS: Record<string, { p: string; s: string }> = {
    "Anticancer":       { p: "#f43f5e", s: "#fb7185" },
    "Antimicrobial":    { p: "#00f5ff", s: "#67e8f9" },
    "Anti-infective":   { p: "#00ff9f", s: "#6ee7b7" },
    "Antiviral":        { p: "#f59e0b", s: "#fcd34d" },
    "Metabolic Disease":{ p: "#f97316", s: "#fdba74" },
    "Drug Delivery":    { p: "#8b5cf6", s: "#c4b5fd" },
    "Neurology":        { p: "#a78bfa", s: "#c4b5fd" },
    "Autoimmune":       { p: "#ec4899", s: "#f9a8d4" },
  };
  const col = area ? (AREA_COLORS[area] ?? { p: "#00f5ff", s: "#67e8f9" }) : { p: "#00f5ff", s: "#67e8f9" };
  const P = col.p; const S = col.s;

  // AA chemical property → node color
  function aaColor(aa: string): string {
    if ("AVLIPFMW".includes(aa)) return "#f59e0b";  // hydrophobic – amber
    if ("KRH".includes(aa))      return P;            // positive – accent
    if ("DE".includes(aa))       return "#f43f5e";   // negative – rose
    if ("STNQ".includes(aa))     return "#00ff9f";   // polar – emerald
    return "#8b5cf6";                                  // special (C,G,Y) – purple
  }

  // Hex grid background
  function hexGrid(): string {
    const out: string[] = [];
    const R = 22;
    const W = R * 2;
    const H = R * Math.sqrt(3);
    for (let row = -1; row < 15; row++) {
      for (let col = -1; col < 13; col++) {
        const cx = col * W * 0.75 + (row % 2 === 0 ? 0 : W * 0.375);
        const cy = row * H * 0.5;
        const pts = Array.from({ length: 6 }, (_, i) => {
          const a = (Math.PI / 3) * i;
          return `${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R * Math.sin(a)).toFixed(1)}`;
        }).join(" ");
        out.push(`<polygon points="${pts}" fill="none" stroke="${P}" stroke-width="0.4" opacity="0.06"/>`);
      }
    }
    return out.join("");
  }

  // Radial molecule graph
  function moleculeGraph(): string {
    const aas = seq.split("").slice(0, 20);
    const n = aas.length;
    const CX = 300, CY = 308;

    interface Node { x: number; y: number; aa: string; color: string }
    let nodes: Node[] = [];

    if (n <= 10) {
      const R = 112;
      nodes = aas.map((aa, i) => {
        const a = (2 * Math.PI * i / n) - Math.PI / 2;
        return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a), aa, color: aaColor(aa) };
      });
    } else {
      const inner = aas.slice(0, 8);
      const outer = aas.slice(8);
      const IR = 72, OR = 128;
      nodes = [
        ...inner.map((aa, i) => {
          const a = (2 * Math.PI * i / inner.length) - Math.PI / 2;
          return { x: CX + IR * Math.cos(a), y: CY + IR * Math.sin(a), aa, color: aaColor(aa) };
        }),
        ...outer.map((aa, i) => {
          const a = (2 * Math.PI * i / outer.length) - Math.PI / 2;
          return { x: CX + OR * Math.cos(a), y: CY + OR * Math.sin(a), aa, color: aaColor(aa) };
        }),
      ];
    }

    const bonds: string[] = [];
    const ni = n <= 10 ? n : 8;
    // inner ring bonds
    for (let i = 0; i < ni; i++) {
      const a = nodes[i], b = nodes[(i + 1) % ni];
      bonds.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${a.color}" stroke-width="1.8" opacity="0.3"/>`);
    }
    if (n > 10) {
      const outer = nodes.slice(8);
      for (let i = 0; i < outer.length; i++) {
        const a = outer[i], b = outer[(i + 1) % outer.length];
        bonds.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${a.color}" stroke-width="1.8" opacity="0.3"/>`);
      }
      for (let i = 0; i < Math.min(8, outer.length); i++) {
        const a = nodes[i], b = outer[i % outer.length];
        bonds.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${P}" stroke-width="0.8" opacity="0.18"/>`);
      }
    }

    const nodeEls = nodes.map(nd => `
      <circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="13" fill="${nd.color}" opacity="0.12"/>
      <circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="8" fill="#080d1a" stroke="${nd.color}" stroke-width="1.8"/>
      <text x="${nd.x.toFixed(1)}" y="${(nd.y + 3.5).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="7.5" fill="${nd.color}" font-weight="bold">${nd.aa}</text>`
    ).join("");

    return [...bonds, nodeEls].join("");
  }

  // Score arc (dashed ring around center)
  const ARC_R = 38;
  const ARC_C = 2 * Math.PI * ARC_R;
  const arcDash = ((score / 100) * ARC_C).toFixed(1);

  // Short ID display
  const shortId = id.slice(0, 12);
  const areaLabel = (area ?? "RESEARCH").toUpperCase();
  const seqDisplay = seq.length > 18 ? seq.slice(0, 16) + "…" : seq;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <radialGradient id="bgr" cx="50%" cy="50%">
      <stop offset="0%" stop-color="#0e1628"/>
      <stop offset="100%" stop-color="#060a14"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%">
      <stop offset="0%" stop-color="${P}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${P}" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
    <filter id="softglow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="600" height="600" fill="url(#bgr)"/>

  <!-- Hex grid -->
  ${hexGrid()}

  <!-- Outer decorative rings -->
  <circle cx="300" cy="308" r="175" fill="none" stroke="${P}" stroke-width="0.6" opacity="0.12" stroke-dasharray="4 8"/>
  <circle cx="300" cy="308" r="158" fill="none" stroke="${S}" stroke-width="0.4" opacity="0.08"/>

  <!-- Center glow -->
  <circle cx="300" cy="308" r="90" fill="url(#glow)" filter="url(#blur)" opacity="0.6"/>

  <!-- Molecule graph -->
  ${moleculeGraph()}

  <!-- Center glow ring -->
  <circle cx="300" cy="308" r="${ARC_R + 10}" fill="none" stroke="${P}" stroke-width="0.8" opacity="0.08"/>
  <circle cx="300" cy="308" r="${ARC_R}" fill="none" stroke="${P}" stroke-width="1.2" opacity="0.15"/>
  <circle cx="300" cy="308" r="${ARC_R}" fill="none" stroke="${P}" stroke-width="2.8"
    stroke-dasharray="${arcDash} ${ARC_C.toFixed(1)}" stroke-linecap="round"
    transform="rotate(-90 300 308)" filter="url(#softglow)" opacity="0.95"/>

  <!-- Peptimus logo center -->
  <image x="276" y="284" width="48" height="48"
    href="data:image/png;base64,${LOGO_PNG_B64}"
    preserveAspectRatio="xMidYMid meet" opacity="0.9"/>

  <!-- Top bar -->
  <rect x="0" y="0" width="600" height="58" fill="#ffffff04"/>
  <rect x="0" y="57" width="600" height="0.5" fill="${P}" opacity="0.2"/>

  <!-- NFT ID top left -->
  <text x="22" y="26" font-family="monospace" font-size="9" fill="${P}" opacity="0.5" letter-spacing="1">PEPTIMUS</text>
  <text x="22" y="42" font-family="monospace" font-size="10" fill="${S}" letter-spacing="0.5">${shortId}</text>

  <!-- Therapeutic area badge top right -->
  <rect x="${600 - areaLabel.length * 7.2 - 28}" y="14" width="${areaLabel.length * 7.2 + 16}" height="22" rx="4" fill="${P}" fill-opacity="0.15" stroke="${P}" stroke-width="0.8" stroke-opacity="0.4"/>
  <text x="${600 - areaLabel.length * 3.6 - 20}" y="29" text-anchor="middle" font-family="monospace" font-size="8.5" fill="${P}" font-weight="bold" letter-spacing="1">${areaLabel}</text>

  <!-- Bottom bar -->
  <rect x="0" y="542" width="600" height="58" fill="#ffffff04"/>
  <rect x="0" y="542" width="600" height="0.5" fill="${P}" opacity="0.15"/>

  <!-- Sequence bottom -->
  <text x="300" y="566" text-anchor="middle" font-family="monospace" font-size="11" fill="${P}" opacity="0.7" letter-spacing="3">${seqDisplay}</text>
  <text x="300" y="585" text-anchor="middle" font-family="monospace" font-size="8" fill="#ffffff" opacity="0.2" letter-spacing="2">MOLECULE IP-NFT · SOLANA · PEPTIMUS PROTOCOL</text>

  <!-- Corner accents -->
  <line x1="0" y1="0" x2="30" y2="0" stroke="${P}" stroke-width="2" opacity="0.5"/>
  <line x1="0" y1="0" x2="0" y2="30" stroke="${P}" stroke-width="2" opacity="0.5"/>
  <line x1="600" y1="0" x2="570" y2="0" stroke="${P}" stroke-width="2" opacity="0.5"/>
  <line x1="600" y1="0" x2="600" y2="30" stroke="${P}" stroke-width="2" opacity="0.5"/>
  <line x1="0" y1="600" x2="30" y2="600" stroke="${P}" stroke-width="2" opacity="0.5"/>
  <line x1="0" y1="600" x2="0" y2="570" stroke="${P}" stroke-width="2" opacity="0.5"/>
  <line x1="600" y1="600" x2="570" y2="600" stroke="${P}" stroke-width="2" opacity="0.5"/>
  <line x1="600" y1="600" x2="600" y2="570" stroke="${P}" stroke-width="2" opacity="0.5"/>
</svg>`;

  try {
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 600 } });
    const png = resvg.render().asPng();
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(png);
  } catch {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(svg);
  }
});

peptidesRouter.post("/peptides/:id/ipnft", async (req, res) => {
  try {
    const ipnftMeta = req.body as IpnftMeta;
    if (!ipnftMeta?.therapeuticArea) {
      return res.status(400).json({ error: "ipnftMeta.therapeuticArea is required" });
    }
    await db.update(peptidesTable)
      .set({ ipnftMeta: { ...ipnftMeta, registeredAt: new Date().toISOString() } })
      .where(eq(peptidesTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save IP-NFT metadata" });
  }
});

peptidesRouter.post("/peptides/:id/mint", async (req, res) => {
  try {
    const { mintAddress } = req.body as { mintAddress: string };
    if (!mintAddress) return res.status(400).json({ error: "mintAddress required" });

    await db.update(peptidesTable).set({ mintAddress }).where(eq(peptidesTable.id, req.params.id));
    res.json({ success: true, mintAddress });
  } catch (err) {
    res.status(500).json({ error: "Failed to record mint" });
  }
});

export { peptidesRouter };
export default peptidesRouter;
