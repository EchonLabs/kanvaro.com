# Kanvaro OAuth contract (for confirmation by the Kanvaro developers)

**Status:** proposed, 26 Nov 2026 — implemented by the MCP server's stand-in
([test/stub-kanvaro/stub.ts](../test/stub-kanvaro/stub.ts)) and its tests.
**Purpose:** the exact requests and responses the MCP server and Claude Code will use, so
Kanvaro's real endpoints (K-1 to K-7) and the stand-in match. Please confirm or correct
each section.

`{issuer}` = Kanvaro's public origin, e.g. `https://kanvaro.example.com` (no trailing slash).

## 1. Clients (K-1)

| client_id | Type | Allowed | Redirect URIs |
|---|---|---|---|
| `kanvaro-claude-code` | public (no secret) | `authorization_code`, `refresh_token` | `http://localhost:33418/callback` (loopback: any port allowed, everything else exact) |
| `kanvaro-mcp-server` | confidential (secret, stored hashed) | token exchange only | none |

## 2. Metadata (K-2) — `GET {issuer}/.well-known/oauth-authorization-server`

```json
{
  "issuer": "{issuer}",
  "authorization_endpoint": "{issuer}/oauth/authorize",
  "token_endpoint": "{issuer}/api/oauth/token",
  "jwks_uri": "{issuer}/api/oauth/jwks",
  "revocation_endpoint": "{issuer}/api/oauth/revoke",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:token-exchange"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none", "client_secret_basic"],
  "authorization_response_iss_parameter_supported": true,
  "scopes_supported": ["kanvaro"]
}
```

## 3. Authorize (K-3) — `GET {issuer}/oauth/authorize`

Query: `response_type=code`, `client_id`, `redirect_uri`, `code_challenge`,
`code_challenge_method=S256`, `state`, `resource` (= the MCP server URL, e.g.
`https://mcp.example.com/mcp`), `scope=kanvaro` (optional).

| Situation | Response |
|---|---|
| Unknown client, `kanvaro-mcp-server`, or redirect URI not registered | **400 page, no redirect** |
| Signed-out user | Kanvaro's `/login?returnTo=…`, then back here |
| `response_type` ≠ `code` | redirect `error=unsupported_response_type` |
| Missing `state`, missing or non-S256 PKCE | redirect `error=invalid_request` |
| `resource` ≠ MCP server URL | redirect `error=invalid_target` |
| `scope` other than `kanvaro` | redirect `error=invalid_scope` |
| Inactive user, or consent refused | redirect `error=access_denied` |
| Success (after consent) | **302** to `redirect_uri?code=…&state=…&iss={issuer}` |

Every redirect, including errors, carries `state` and `iss`. Code: random, stored hashed,
60 s, single use.

## 4. Token endpoint (K-4, K-5) — `POST {issuer}/api/oauth/token`

Body `application/x-www-form-urlencoded`. Responses `Cache-Control: no-store`.
Errors: JSON `{ "error": "…", "error_description": "…" }`, HTTP 400 (401 for client
authentication, with `WWW-Authenticate: Basic`).

### 4.1 `grant_type=authorization_code` (client `kanvaro-claude-code`, no secret)
Fields: `client_id`, `code`, `redirect_uri` (same as at authorize), `code_verifier`,
`resource` (optional; must equal the one at authorize).

```json
{ "access_token": "<JWT>", "token_type": "Bearer", "expires_in": 900, "refresh_token": "<random>", "scope": "kanvaro" }
```

A reused code → `invalid_grant`, **and** the tokens issued from its first use are revoked.

**MCP access token (JWT):** header `{ "alg": "ES256", "kid": "…", "typ": "at+jwt" }`,
claims:

| Claim | Value |
|---|---|
| `iss` | `{issuer}` |
| `sub` | Kanvaro user id |
| `aud` | the MCP server URL (the `resource`) |
| `client_id` | `kanvaro-claude-code` |
| `scope` | `kanvaro` |
| `iat`, `exp` | `exp` = `iat` + 900 |
| `jti` | random |

Signed with Kanvaro's **new** asymmetric key (not `JWT_SECRET`), so Kanvaro's API refuses it.

### 4.2 `grant_type=refresh_token` (client `kanvaro-claude-code`)
Fields: `client_id`, `refresh_token`, `resource` (optional). Same response shape as 4.1,
with a **new** refresh token. The old one is used up; presenting it again → `invalid_grant`
**and the whole family is revoked**. Refresh lifetime: 7 days.

### 4.3 Token exchange (client `kanvaro-mcp-server`, HTTP Basic)
`Authorization: Basic base64(kanvaro-mcp-server:<secret>)`. Fields:
`grant_type=urn:ietf:params:oauth:grant-type:token-exchange`,
`subject_token=<MCP access token>`,
`subject_token_type=urn:ietf:params:oauth:token-type:access_token`.

```json
{ "access_token": "<Kanvaro JWT>", "issued_token_type": "urn:ietf:params:oauth:token-type:access_token", "token_type": "Bearer", "expires_in": 900 }
```

- `access_token` is a normal Kanvaro access token (`{ userId, email, role }`, HS256 with
  `JWT_SECRET`), so `authenticateUser` accepts it unchanged.
- `exp` ≤ now + 900 **and** ≤ the subject token's `exp`.
- No refresh token.
- Refused with `invalid_grant` when: bad signature, wrong `iss` or `aud`, expired, user
  inactive, **or the refresh family it came from was revoked** (so revocation takes effect
  at once, not after 15 minutes).
- Wrong or missing client credentials → 401 `invalid_client`.

## 5. JWKS (K-6) — `GET {issuer}/api/oauth/jwks`

`{ "keys": [ { "kty": "EC", "crv": "P-256", "x": "…", "y": "…", "kid": "…", "alg": "ES256", "use": "sig" } ] }`
— during key rotation both old and new keys are listed.

## 6. Revoke (K-7) — `POST {issuer}/api/oauth/revoke`

Fields: `token=<refresh token>`, `client_id=kanvaro-claude-code`. Always `200`
(RFC 7009). Revokes the token's whole family.

## 7. Points to confirm

1. ES256 for MCP access tokens (RS256 also acceptable to the MCP server).
2. Exchange checks the refresh family (immediate revocation) — recommended.
3. A reused authorization code revokes its tokens — recommended.
4. `typ: at+jwt` in the access token header.
5. Paths `/oauth/authorize`, `/api/oauth/token`, `/api/oauth/jwks`, `/api/oauth/revoke`.
