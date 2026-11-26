# D10 — Sign-in through Kanvaro, token exchange in the MCP server

**Status:** decided 25 Nov 2026 (supervisor). Replaces the "two sign-in servers" design.
**One-page rationale:** "Storing Kanvaro Tokens in the MCP Server" (Option B).

## Decision

Kanvaro is the **only** OAuth authorization server. Claude Code (and later clients) sign
in on Kanvaro and receive a token **meant for the MCP server**. The MCP server checks that
token and, to call Kanvaro, **exchanges** it at Kanvaro (RFC 8693) for a short-lived
Kanvaro API token that it keeps **in memory only**.

The MCP server stores **no user tokens** and has **no encryption key**. Its database holds
only the audit log.

## Flow

**Sign-in (once per user and client)**
1. Claude Code calls `/mcp` with no token → `401` + `resource_metadata`.
2. It reads the MCP server's protected-resource metadata, which names **Kanvaro** as the
   authorization server, then Kanvaro's authorization-server metadata.
3. The browser opens Kanvaro's `/oauth/authorize`. A signed-out user goes through
   Kanvaro's login page first. Kanvaro shows the consent screen, then redirects to Claude
   Code's localhost callback with a one-time code and `iss`.
4. Claude Code exchanges the code (PKCE) at Kanvaro's token endpoint. It receives an
   **MCP access token** (JWT, audience = MCP server URL, 15 min) and a refresh token.

**Every tool call**
1. Claude Code calls `/mcp` with the MCP access token.
2. The MCP server verifies it: signature (Kanvaro's public key), `iss`, `aud`, expiry.
3. It exchanges the token at Kanvaro's token endpoint for a **Kanvaro API token** for the
   same user, or reuses one still cached in memory.
4. It calls the Kanvaro API with that token. Kanvaro applies the user's permissions.
5. It writes one audit entry and returns the result.

**Renewal:** Claude Code refreshes its own token at Kanvaro. The MCP server does nothing.
**Sign out / deactivation:** Kanvaro revokes the refresh token or refuses the exchange.
The MCP server re-checks every session with Kanvaro (a new exchange) **at least once a
minute**, so a sign-out or admin revoke takes effect within about a minute (found and
fixed in task 3.4; a plain 15-minute cache would have let it run for up to 15 minutes).
Kanvaro already rechecks `isActive` on every API call, so a deactivated user loses
access at once.

## What Kanvaro builds (workstream A)

| # | Item | Details |
|---|---|---|
| K-1 | Client registry | Pre-registered clients (decision D6). `kanvaro-claude-code`: public client, redirect `http://localhost:33418/callback`. `kanvaro-mcp-server`: confidential client (secret stored hashed), allowed **only** the token-exchange grant |
| K-2 | Authorization-server metadata | `GET /.well-known/oauth-authorization-server`: `issuer`, `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `revocation_endpoint`, `response_types_supported: ["code"]`, `grant_types_supported` (code, refresh, token-exchange), `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none","client_secret_basic"]`, `authorization_response_iss_parameter_supported: true`, `scopes_supported: ["kanvaro"]` |
| K-3 | Authorize page with consent | `GET /oauth/authorize`: exact client and redirect check (loopback rule from task 0.3), `response_type=code`, PKCE `S256`, `state`, `resource` must equal the MCP server URL. Signed-out users go to `/login?returnTo=…` (fix the open redirect first, F5). Consent screen names the application and its redirect host. Code is random, stored hashed, 60 s, single use. Redirect carries `code`, `state`, `iss` |
| K-4 | Token endpoint | `POST /api/oauth/token`. **authorization_code** (public client + PKCE): MCP access token = JWT signed with Kanvaro's **new asymmetric key** (`iss`, `sub` user id, `aud` = MCP URL, `client_id`, `scope`, `exp` 15 min, `jti`) + refresh token (random, stored hashed, 7 days, rotated). **refresh_token**: rotate; reuse of a rotated token revokes the whole family. **token-exchange**: see K-5 |
| K-5 | Token exchange | Grant `urn:ietf:params:oauth:grant-type:token-exchange`, client auth = `kanvaro-mcp-server` credentials, `subject_token` = an MCP access token (verified: signature, `aud` = MCP URL, not expired, user active). Returns a normal Kanvaro access token for the same user (current JWT format, works with `authenticateUser`), lifetime ≤ the subject token's remaining life, max 15 min. No refresh token |
| K-6 | JWKS + signing key | `GET /api/oauth/jwks` publishes the public key(s) for MCP access tokens (ES256 or RS256, `kid`). Private key from the secret store; keep the old key listed during rotation. Separate from the existing `JWT_SECRET` |
| K-7 | Revocation | `POST /api/oauth/revoke` for refresh tokens; revoke all of a user's tokens on deactivation |
| K-8 | Rate limits and logging | On authorize, token and exchange; never log tokens or codes |

**Fix first** (separate from K-1 to K-8): the security fixes F0–F11 from the Phase 0
review, including the Bearer fixes for cookie-only routes (F3).

## What the MCP server builds (workstreams B–D)

| Item | Details |
|---|---|
| Protected-resource metadata | `/.well-known/oauth-protected-resource[/mcp]` with `authorization_servers: [<Kanvaro issuer>]`; `401` responses carry `resource_metadata` |
| Token verification | SDK `requireBearerAuth` with a verifier that checks the JWT against Kanvaro's JWKS (cached), `iss`, `aud` = own URL (`expectedResource`), expiry |
| Token exchange client | Calls Kanvaro's token endpoint with its client credentials; caches the Kanvaro API token **in memory** by a hash of the MCP token, until it expires; one exchange at a time per token |
| Sign-in-again path | Exchange refused (revoked, deactivated) → `401 invalid_token` with `resource_metadata`, so Claude Code signs in again |
| Tools, audit log, rate limits | As planned |

**No longer built in the MCP server:** client registration, authorize and consent, the
Kanvaro callback, issuing and renewing tokens, the Kanvaro token store, token encryption
(task 1.4), and the collections `clients`, `pending_authorizations`, `auth_codes`,
`tokens`, `user_kanvaro_tokens`.

## Changes to the implementation plan

| Plan item | Change |
|---|---|
| 1.2 Configuration | Encryption keys and token lifetimes removed; Kanvaro client secret now used for the exchange |
| 1.3 Database | Audit log only |
| 1.4 Encryption helper | **Dropped** |
| 1.5 Kanvaro API client | Uses the exchanged token; on `401` from Kanvaro, re-exchange once, then fail closed |
| Phase 2 (Kanvaro) | K-1 to K-8 above, plus the fixes F0–F11 (larger than before: metadata, consent, refresh for clients, exchange, JWKS) |
| Phase 3 (MCP sign-in) | Becomes: metadata, token verification, exchange client, sign-in-again path |
| Security controls | "Users' Kanvaro tokens encrypted" → "no user tokens stored by the MCP server". Add: asymmetric signing key in Kanvaro's secret store; exchange limited to the MCP server's client |
| Tests | Add: token for another audience refused; exchange with a revoked or deactivated user refused; exchange without client credentials refused; MCP server restart loses nothing but its cache |
