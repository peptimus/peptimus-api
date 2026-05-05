# Peptimus API

[![CI](https://github.com/peptimus/peptimus-api/actions/workflows/ci.yml/badge.svg)](https://github.com/peptimus/peptimus-api/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-00f5ff?style=flat-square&labelColor=0a0f1c)](LICENSE)
[![Author](https://img.shields.io/badge/author-peptimusdev-8b5cf6?style=flat-square&labelColor=0a0f1c)](https://github.com/peptimusdev)
[![Node](https://img.shields.io/badge/Node.js-24-339933?style=flat-square&logo=node.js&logoColor=white&labelColor=0a0f1c)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white&labelColor=0a0f1c)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat-square&logo=postgresql&logoColor=white&labelColor=0a0f1c)](https://www.postgresql.org)
[![Solana](https://img.shields.io/badge/Solana-Mainnet-9945FF?style=flat-square&logo=solana&logoColor=white&labelColor=0a0f1c)](https://solana.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=0a0f1c)](https://www.typescriptlang.org)

REST API server and PostgreSQL database layer for the Peptimus platform. Built with Express 5 and Drizzle ORM.

**Author:** [peptimusdev](https://github.com/peptimusdev)

---

## API Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/healthz` | Health check |
| GET | `/api/stats` | Aggregate platform stats |
| GET | `/api/peptides` | All peptides (optional `?wallet=`) |
| GET | `/api/peptides/:id` | Single peptide by ID |
| GET | `/api/search?q=` | Full-text search across peptides |
| POST | `/api/peptides/design` | AI peptide generation via OpenAI |
| POST | `/api/peptides/:id/mint` | Save mint address to DB |
| POST | `/api/peptides/:id/ipnft` | Save IP-NFT metadata to DB |
| GET | `/api/peptides/:id/metadata` | Molecule Protocol IP-NFT metadata |
| GET | `/api/peptides/:id/agreement` | License agreement JSON |
| GET | `/api/peptides/:id/image` | SVG molecule image |
| POST | `/api/users/register` | Register wallet on first connect |
| GET | `/api/community/activity` | Live activity feed |
| GET | `/api/research/feed` | Research events feed |

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 |
| Framework | Express 5 |
| ORM | Drizzle ORM |
| Database | PostgreSQL |
| Validation | Zod v4 |
| AI | OpenAI GPT |
| Blockchain | Solana Web3 + Metaplex Bubblegum |
| Logging | Pino |
| Build | esbuild |
| Language | TypeScript 5.9 |

---

## Development

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
```

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
```

```bash
pnpm --filter @workspace/db run push
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `OPENAI_API_KEY` | OpenAI API key for peptide generation |
| `PLATFORM_WALLET_PRIVATE_KEY` | Solana keypair for gasless NFT minting |
| `HELIUS_API_KEY` | Helius RPC key for Solana Mainnet |

---

**Built by [peptimusdev](https://github.com/peptimusdev)**
