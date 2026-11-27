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

## Database

Users sign in at **Kanvaro**, which issues the tokens; this server verifies them and
exchanges them for short-lived Kanvaro API tokens kept in memory only (decision
[D10](docs/decisions/D10-token-exchange.md)). So the server stores **no user tokens** and
has no encryption key.

Its only stored data is the **audit log**, in a **separate** MongoDB database (default
`kanvaro_mcp`). No Kanvaro business data. The collection and its indexes are created at
startup; entries older than `AUDIT_RETENTION_DAYS` are deleted automatically (TTL index).

**Database user (production).** The login in `MONGODB_URI` must not be able to read
Kanvaro's database. Create a user limited to this database, for example in `mongosh`:

```js
use kanvaro_mcp
db.createUser({ user: 'kanvaro_mcp', pwd: passwordPrompt(), roles: [{ role: 'readWrite', db: 'kanvaro_mcp' }, { role: 'dbAdmin', db: 'kanvaro_mcp' }] })
```

(`dbAdmin` is needed to create indexes and change the audit TTL at startup.)

**Secrets:** only two — `MONGODB_URI` and `KANVARO_CLIENT_SECRET` (this server's client
secret at Kanvaro, used for token exchange). See `.env.example`.

**Tests** use `MONGODB_TEST_URI` (default `mongodb://localhost:27017`) and a throw-away
database per run. Without a reachable MongoDB they are skipped locally; CI sets
`REQUIRE_MONGO=1` so they fail instead.

## Relationship to Kanvaro

This package lives in the Kanvaro repository but is **not** part of Kanvaro's build:

- excluded from Kanvaro's `tsconfig.json` and Jest run;
- not in Kanvaro's Docker image: the image's final stage copies only Next's standalone
  output, which never includes this folder;
- has its own `package.json`, lockfile, Dockerfile (task 1.7) and CI job
  (`.github/workflows/mcp-server.yml`, runs only when `mcp-server/**` changes).
