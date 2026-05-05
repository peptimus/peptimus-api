# Contributing to Peptimus API

Thank you for your interest in contributing to the Peptimus API server. This document outlines the process for submitting changes to this repository.

## Getting Started

1. Fork the repository and clone your fork locally.
2. Install dependencies with `pnpm install`.
3. Copy `.env.example` to `.env` and fill in the required values.
4. Start the development server with `pnpm dev`.
5. Create a new branch from `main` for your change.

## Branch Naming

| Type | Pattern | Example |
|---|---|---|
| Feature | `feat/<short-description>` | `feat/peptide-search-endpoint` |
| Bug fix | `fix/<short-description>` | `fix/mint-route-500` |
| Docs | `docs/<short-description>` | `docs/openapi-update` |
| Chore | `chore/<short-description>` | `chore/upgrade-drizzle` |

## Development Guidelines

- All route handlers are written in **TypeScript** — avoid `any` types.
- Routes live in `src/routes/`, middleware in `src/middleware/`, DB schema in `src/db/schema/`.
- Use **Zod** for all request body and query parameter validation.
- Use **Drizzle ORM** for all database operations — no raw SQL unless unavoidable.
- Log with **Pino** — never use `console.log` in production code paths.
- All environment variables must use `APP_DOMAIN` / `HOST` — never reference Replit-specific vars.
- Keep routes RESTful — one resource per router file.

## Database Changes

- Schema changes go in `src/db/schema/`.
- After modifying schema, run `pnpm db:generate` to generate migrations.
- Include migration files in your pull request.
- Never modify existing migration files — create new ones.

## Pull Request Process

1. Ensure CI passes — the workflow runs `tsc --noEmit` and a clean-ref scan.
2. Keep pull requests focused — one logical change per PR.
3. Fill out the pull request template completely.
4. Link any related issues using `Closes #<issue>`.
5. Request a review from `@peptimusdev`.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org):

```
feat: add /peptides/search endpoint with filter params
fix: handle missing wallet param in mint route
chore: upgrade express to 5.1
docs: document auth middleware
```

## Reporting Issues

Use the issue templates available in the repository:
- **Bug Report** — for reproducible defects
- **Feature Request** — for new functionality proposals

## Code of Conduct

Be respectful and constructive. Contributions that are disrespectful toward maintainers or other contributors will not be accepted.

---

**Maintainer:** [peptimusdev](https://github.com/peptimusdev)
