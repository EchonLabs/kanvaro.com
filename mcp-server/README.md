# Kanvaro MCP server

A separate service that lets approved applications (first: Claude Code) read and update
Kanvaro data **as the signed-in user**, through the Model Context Protocol.

- Plans: *Kanvaro MCP Server — Architecture Plan v2.0* and *Detailed Implementation Plan*.
- Phase 0 results and decisions: [docs/phase-0](docs/phase-0).

## Requirements

- Node 24 LTS (`.nvmrc`); Node ≥ 22.12 works for local development.
- MongoDB (a separate database from Kanvaro's) — from task 1.3.

## Commands

```bash
npm install
npm run dev         # run with reload (tsx)
npm run check       # typecheck + lint + tests
npm run build       # compile to dist/
npm start           # run the compiled server
```

## Layout

| Path | Contents |
|---|---|
| `src/` | Server source |
| `test/` | Tests (vitest) |
| `docs/` | Phase notes and decisions |
| `tools/` | Development scripts: OAuth probe, route checks, test-data seeding (not part of the server) |
| `scripts/vitest.mjs` | Test launcher that fixes a Windows drive-letter case problem (see the comment in the file); `npm test` uses it |

## Relationship to Kanvaro

This package lives in the Kanvaro repository but is **not** part of Kanvaro's build:

- excluded from Kanvaro's `tsconfig.json` and Jest run;
- not in Kanvaro's Docker image: the image's final stage copies only Next's standalone
  output, which never includes this folder;
- has its own `package.json`, lockfile, Dockerfile (task 1.7) and CI job
  (`.github/workflows/mcp-server.yml`, runs only when `mcp-server/**` changes).
