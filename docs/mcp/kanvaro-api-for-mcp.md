# Kanvaro API — Reference for MCP Server Developers


This document tells you how the Kanvaro REST API behaves **after** the security fixes on this branch, so the MCP server's tools can call it correctly. It covers authentication, how permissions and scoping work, what each fixed route now expects, and the traps that will otherwise cost you a day.

---

## 1. The model in one paragraph

Sign-in follows **D10** (`mcp-server/docs/decisions/D10-token-exchange.md`, contract in `mcp-server/docs/kanvaro-oauth-contract.md`): Kanvaro is the only authorization server. Claude Code signs in on Kanvaro and holds an **MCP access token**. For each call, the MCP server **exchanges** that token at Kanvaro for a short-lived **Kanvaro API token** and calls Kanvaro's existing REST API **as the user** with `Authorization: Bearer <Kanvaro API token>`.

Kanvaro decides what is allowed. The MCP server never decides permissions itself; it only narrows what it sends (field allow-lists) and what it passes back (response filters), per §2.3 of the decision record. If a route refuses, surface the refusal; do not retry with different identity values.

---

## 2. Authentication

### 2.1 Sending the token

```
Authorization: Bearer <Kanvaro API token from the token exchange>
```

Every route that authenticates uses `authenticateUser()` in [`src/lib/auth-utils.ts`](../../src/lib/auth-utils.ts). It accepts the Bearer header first and falls back to the browser cookies. After this branch, **every route the MCP server should call** goes through it — including the time-tracking, `auth/me`, `hr/*` and `bulk-upload` routes, which used to read only the cookie (F3).

**Never forward the MCP access token to Kanvaro's API.** It is signed with Kanvaro's separate asymmetric key (K-6) and has the MCP server as its audience, so `authenticateUser()` refuses it. Only the exchanged Kanvaro API token works.

### 2.2 The tokens involved

| Token | Who holds it | Format | Lifetime |
|---|---|---|---|
| **MCP access token** | Claude Code | JWT, ES256 with Kanvaro's OAuth key, `aud` = MCP server URL, `sub` = user id | 15 minutes |
| **MCP refresh token** | Claude Code | Random, stored hashed by Kanvaro, rotated on use | 7 days |
| **Kanvaro API token** (from the exchange) | MCP server, **in memory only** | Normal Kanvaro access token `{ userId, email, role }`, HS256 with `getJwtSecret()` | ≤ 15 min and ≤ the MCP token's remaining life; **no refresh token** |
| Browser access / refresh cookies | The Kanvaro web app | `{ userId, email, role }` / `{ userId, email }`, `getJwtSecret()` / `getJwtRefreshSecret()` | 15 minutes / 7 days |

The MCP server stores **no user tokens** and has no encryption key (D10). Cache the Kanvaro API token by a hash of the MCP access token until it expires, and run one exchange at a time per MCP token.

### 2.3 Renewal (D10) — the MCP server does not refresh anything

The MCP server **never** uses `grant_type=refresh_token`; that grant belongs to Claude Code.

- **Claude Code** refreshes its own MCP access token at Kanvaro (contract §4.2).
- **The MCP server** gets each Kanvaro API token by **token exchange** (contract §4.3): `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`, `subject_token=<MCP access token>`, client `kanvaro-mcp-server` with HTTP Basic credentials.
- **On a `401` from Kanvaro's API** (exchanged token expired, or Kanvaro rejected it): exchange again **once** and retry the call **once**.
- **If the exchange is refused** (`invalid_grant`: token expired or revoked, user deactivated, refresh family revoked), fail closed: return `401 invalid_token` with `resource_metadata` to Claude Code, so it signs in again.

Why the re-exchange is needed: `authenticateUser()` renews an expired access token **only from the browser's `refreshToken` cookie**. A Bearer caller has no cookie, so an expired Kanvaro API token simply gets:

```json
401 { "error": "Invalid access token" }
```

### 2.4 Secrets — use the shared helper (F0)

All JWT secrets are read through [`src/lib/auth/jwt-secrets.ts`](../../src/lib/auth/jwt-secrets.ts):

```ts
import { getJwtSecret, getJwtRefreshSecret } from '@/lib/auth/jwt-secrets'
```

- The refresh secret is `JWT_REFRESH_SECRET`, falling back to `REFRESH_TOKEN_SECRET` (the name production and the docker-compose files actually set).
- Everywhere except `NODE_ENV=development` and `NODE_ENV=test`, a missing secret, or one of the placeholder values published in this repo, **throws**; auth then fails with 500 instead of accepting forgeable tokens. That includes staging, a mistyped value and an unset `NODE_ENV`.
- In development and test a dev-only fallback is used with a warning.

> **Authorize page and token endpoint authors (K-3 to K-5):** never read `process.env.JWT_SECRET` / `JWT_REFRESH_SECRET` directly, and never with a default. Production sets only `REFRESH_TOKEN_SECRET`, so reading `JWT_REFRESH_SECRET` yourself gives `undefined`, and `|| 'your-refresh-secret-key'` brings back the F0 forgery.
>
> - Checking the browser session on `/oauth/authorize` → `getJwtSecret()` / `getJwtRefreshSecret()`.
> - Signing the exchanged Kanvaro API token (K-5) → `getJwtSecret()`, so `authenticateUser()` accepts it.
> - The MCP access token is signed with the **separate** OAuth key (K-6), not these secrets.
>
> As of 26 Nov 2026, `feat/mcp-authorization-page` still reads them directly with the old defaults in `src/app/api/oauth/authorize/route.ts` (lines 17–18) and `src/lib/oauth/service.ts` (line 594). Fix this before that branch reaches any shared server: with only `REFRESH_TOKEN_SECRET` set, a forged refresh cookie would get an authorization code issued as any user.

### 2.5 Things the MCP server must never send identity in

Identity comes **only** from the token. Routes ignore `userId` / `organizationId` sent in the query or body where they used to trust them (F2). Do not build tools that pass them; they have no effect and suggest a capability that does not exist.

Exception: `POST /api/time-tracking/entries` keeps `userId` as the **target** person (admins and HR log time for others). The caller's identity still comes from the token, and the target must be in the caller's organisation.

---

## 3. How permissions work (read this before writing any tool)

Source: [`src/lib/permissions/permission-definitions.ts`](../../src/lib/permissions/permission-definitions.ts), [`permission-service.ts`](../../src/lib/permissions/permission-service.ts).

### 3.1 Three permission scopes

| Scope | Meaning | Trap |
|---|---|---|
| **GLOBAL** | Granted org-wide by the user's role or custom role | — |
| **PROJECT** | Granted per project by the user's project role, *or* globally | A global grant counts on **every** project |
| **OWN** | "Your own records" | `hasPermission` **always returns true** for these (e.g. `user:read`) |

### 3.2 Permissions that look restrictive but are not

Every built-in role (viewer and client included) holds these globally, so on their own they limit nothing:

- `project:read`
- `financial:read`
- `team:read`, `user:read`
- `task:manage_comments` (team member, QA, tester — org-wide)

Routes fixed on this branch no longer rely on them alone; they use **project access** instead (below). Keep this in mind if you ever reason about "can this user see X" on the MCP side.

### 3.3 Project access

`PermissionService.canAccessProject(userId, projectId)` / `canAccessProjectIn(perms, projectId)`:

- admin / super admin → every project;
- `project:view_all` (admin, HR, PM) → every project in their organisation;
- everyone else → projects where they are creator, team member, client or have a project role.

`getAccessibleProjects(userId)` returns that list. Most "list" routes now scope to it.

### 3.4 Loading permissions once

`PermissionService.hasPermission()` reloads the user **and all their projects** on every call. New code that needs several checks should do:

```ts
const perms = await PermissionService.getUserPermissions(userId)
PermissionService.hasPermissionIn(perms, Permission.X, projectId)
PermissionService.canAccessProjectIn(perms, projectId)
```

---

## 4. Route behaviour after this branch

Status codes: `401` = no or invalid token, `403` = signed in but not allowed, `404` = not found **or** not allowed (some routes hide existence deliberately). Error bodies are `{ "error": "..." }`, a few routes use `{ "success": false, "error": "..." }`.

### 4.1 Time tracking (F2, F3)

| Route | Behaviour |
|---|---|
| `GET/POST/PUT /api/time-tracking/timer` | Your own timer only. Identity from the token. No permission lookup (it is polled every 30 s by the app). |
| `GET/POST/PUT /api/time-tracking/logs` | Same as timer (older duplicate route). |
| `POST timer` / `POST logs` / `POST entries` | Project must be in your org and visible to you (admin/HR exempt on `entries`). **`hourlyRate` in the body is ignored** — the rate comes from the user record or org settings. |
| `GET /api/time-tracking/entries` | Org from the token. `userId` filter: yourself; anyone with `time_tracking:view_all`; your assigned people with `view_assigned`. |
| `GET /api/time-tracking/entries/:id` | Was unauthenticated. Now: same visibility as the list; otherwise **404**. |
| `PUT /api/time-tracking/entries/:id` | `hourlyRate` is applied only for super admin, admin, HR; ignored otherwise. |
| `GET /api/time-tracking/reports` | Needs `time_tracking:report_access`. Results scoped to view_all / view_assigned / self. Requesting someone you may not see → 403. |
| `GET /api/time-tracking/reports/budget` | Needs report access **and** `time_tracking:view_all` (shows everyone's cost). |

### 4.2 People and roles (F1, F11)

| Route | Behaviour |
|---|---|
| `GET /api/members` | Never returns password, reset OTP/token/expiry, or invitation tokens. `hourlyRate`/`billingRate` only if the caller has `user:update` **and** `team:edit`. Search text is matched literally. `limit` is capped at 10 000 (the app's pickers ask for everything at once) — **send your own page size** (§2.3 of the decision record). |
| `PUT /api/members` | Saves only `firstName`, `lastName`, `memberId`, `isActive`, `hourlyRate`, `role`. Role changes follow the role-grant rules below. Only admins may change an admin's `isActive`. |
| `DELETE /api/members` | Only admins may remove an admin. |
| `POST /api/roles`, `PUT/DELETE /api/roles/:id`, `PUT /api/users/:id/role` | Need `user:manage_roles` plus the role-grant rules. |
| `POST /api/members/invite` | Role-grant rules apply to the invited role. |

**Role-grant rules** ([`role-grant-policy.ts`](../../src/lib/permissions/role-grant-policy.ts)):

1. Managing roles needs `user:manage_roles` (admin, HR, PM hold it).
2. Only admin / super admin can grant the Admin role, change an admin's role, or create / edit / delete / assign a custom role carrying permissions they do not hold.
3. Everyone else works only with custom roles inside their own permissions.
4. Nobody changes their own role.

These are **wave 3 critical writes** (D2) — use the two-step confirmation (D5).

### 4.3 Search (F4)

`GET /api/search`:

- Requires sign-in.
- Results limited to projects the caller can access in their organisation, including the project-number and task display-id shortcuts (`?q=12`, `?q=12.3`).
- People only with an explicit `team:read` or `user:read` grant, only in the caller's organisation.
- `limit` capped at **50**. Search text is matched literally (no regex).

### 4.4 Tasks, comments, stories, epics, sprints (F6, F7)

**Comments** — `POST /api/tasks/:id/comments` is allowed for: `task:view_all`, `project:view_all`, the assignee, the creator, or anyone with `task:update` or `task:manage_comments` **on a project they can access**. `PATCH` / `DELETE` need the comment's author or `task:update` on the task's project, and always the same organisation.

**Update allow-lists** — fields not listed are silently dropped. Build your tool schemas from these, not from the Mongoose models:

| Route | Editable fields |
|---|---|
| `PUT /api/tasks/:id` | `title, description, status, priority, type, category, isBillable, project, module, story, epic, parentTask, assignedTo, storyPoints, dueDate, startDate, estimatedHours, actualHours, position, sprint, labels, dependencies, attachments, subtasks, archived` + `expectedVersion` (not stored) |
| `PUT /api/stories/:id` | `title, description, acceptanceCriteria, project, epic, assignedTo, status, priority, storyPoints, estimatedHours, actualHours, sprint, startDate, dueDate, tags, attachments, archived` |
| `PUT /api/epics/:id` | `title, description, project, assignedTo, status, priority, storyPoints, estimatedHours, actualHours, startDate, dueDate, tags, attachments, archived` |
| `PUT /api/sprints/:id` | `name, description, status, startDate, endDate, goal, capacity, velocity, plannedVelocity, project, teamMembers, tasks, stories, archived` |

Server-owned and never settable through these routes: `organization`, `createdBy`, numbering (`taskNumber`, `displayId`), `completedAt`, estimate/poker/stand-up bookkeeping on tasks, sprint lifecycle and planning fields (`actualStartDate`, `actualEndDate`, `activePlanningSession`, `plannedAt`, `planningWaiver`, health warnings). Sprint start/complete have their own endpoints; a generic PUT cannot start a sprint.

**Concurrent edits** — send `expectedVersion` (the task's last-seen `updatedAt`) on task updates; a stale value returns **409** "Task was modified by another user".

**Project moves** — sending a different `project` is allowed only if the target is in the caller's organisation and they can access it; otherwise **403** "You cannot move this item to that project". The decision record still says the MCP update tool should **not** offer moves (§2.3); this server-side check is the backstop.

### 4.5 Finance (F8)

| Route | Behaviour |
|---|---|
| `GET /api/budget` | Without `projectId`: entries for accessible projects only (was every entry in the DB). With `projectId`: needs project access. |
| `GET /api/budget/:id`, `GET /api/burn-rate` | Need project access (previously `project:read`, held by everyone). |
| `POST/PUT/DELETE /api/projects/:id/expenses` | Need `financial:create_expense` (admin, HR, PM) in addition to project access. |
| `GET /api/projects/:id/income` | Unchanged: project access + `financial:view_income`. |
| `GET /api/reports/financial` | Accessible projects only. Income figures are zero/empty without `financial:view_income`. (Income was always 0 for everyone before this branch: the income query compared the organisation id as a string inside `aggregate()`.) Budget search text is matched literally. |

### 4.6 Test management (F8)

`GET /api/test-cases`, `/api/test-plans`, `/api/test-suites`:

- with the matching read permission (`test_case:read`, etc. — admin, HR, PM, QA, tester) → whole organisation, as before;
- otherwise → only projects where the caller is project manager, member, QA lead or tester. Asking for another project → 403.

Single-item and write routes already required the matching `test_*` permission plus project membership.

### 4.7 Settings (F9, F10)

| Route | Behaviour |
|---|---|
| `GET/PUT /api/settings/email` | `settings:manage_email`. Secrets come back as `••••••••`; sending the placeholder back keeps the stored value; an omitted field also keeps it; `""` clears it. |
| `GET/PUT /api/settings/database` | `settings:manage_database`. Password masked. PUT saves nothing (pre-existing). |
| `GET /api/test-connection` | Open only during first-time setup, then `settings:manage_database`. Returns reachability only. |

These are organisation-wide settings → **wave 3**.

---

## 5. Never expose (D3) — current state

The MCP server must not wrap these. After this branch they are also locked down on the Kanvaro side:

| Routes | State now |
|---|---|
| `setup/complete`, `setup/database/create` | 403 once setup is complete |
| `setup/database/test`, `setup/email/test` | Open during setup; afterwards need the matching settings permission |
| `debug/*` | 404 in production; admin-only in development |
| `test-email` | `settings:manage_email` |
| `email/config` | Sign-in required |
| `cron/*` | Unchanged by decision (CRON-1): open unless `CRON_SECRET` is set. **Set `CRON_SECRET` in production.** |
| `auth/*`, `settings/security/password`, `members/accept`, `members/validate-invitation`, `realtime`, `notifications/stream`, `uploads/*`, `*/export` | Not changed; still never exposed |

---

## 6. Known gaps and hand-offs (not fixed on this branch)

| Item | Owner / note |
|---|---|
| **F5** — login `returnTo` open redirect and double decode | Authorize-page developer. Fix note provided separately. Affects the MCP sign-in flow directly. |
| **Authorize-page branch reads JWT secrets directly, with defaults** | Authorize-page developer. **Blocker** for that branch; see §2.4. |
| `GET /api/reports/gantt` has no project-access check | Signed-in users can read any project's schedule. Follow-up. |
| `GET /api/activity` is scoped to the organisation, not the caller's projects | Team members see activity from projects they are not on. Follow-up. |
| Search text still unescaped in `$regex` | `projects`, `stories`, `epics`, `sprints`, `backlog`, `activity`, `docs`, `templates/projects`, `templates/tasks`, `time-tracking/hr/employees`, `reports/projects`, `reports/team`. Fixed on this branch: `search`, `members`, test lists, `reports/financial` (+ export), docs search. Follow-up. |
| `GET /api/members` permission check passes every user (`user:read` is OWN-scoped) | Deliberately left; all built-in roles may list members anyway. Matters only for custom roles. |
| `verify-otp` has no attempt limit | 6-digit reset OTP can be brute-forced. |
| Reports page sends `approvedBy`, route reads `assignedBy` | Approver filter silently ignored. |
| Azure email settings (`clientId`, `clientSecret`, `tenantId`) | Not in the schema; never saved. |
| `setup/database/test` from the Settings page | Disconnects the app's shared Mongo connection after testing. |
| Production secrets exposed in a screenshot | Rotate MongoDB password, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`. |

---

## 7. Deploying this branch

- Users are signed out once: existing refresh tokens were signed with the public default and stop verifying.
- Every environment whose `NODE_ENV` is anything other than `development` or `test` (the Docker image sets `production` — prod **and QA**) needs `JWT_SECRET` and `JWT_REFRESH_SECRET` or `REFRESH_TOKEN_SECRET` set to real random values, or sign-in returns 500. Check inside the container without printing values:
  ```sh
  docker exec <container> sh -c 'printenv | cut -d= -f1 | grep -E "^(JWT_SECRET|REFRESH_TOKEN_SECRET|JWT_REFRESH_SECRET|NODE_ENV)$"'
  ```
- Local `next start` (production mode) needs a `.env.local` with those two secrets (`openssl rand -hex 32`).
- **Merging with `feat/mcp-authorization-page`:** conflicts in `src/app/api/members/route.ts`. Keep this branch's field allow-list and role-grant checks, **and** keep that branch's `revokeAllForUser()` import and the `wasActive` → deactivated → `revokeAllForUser(member._id)` block around the save in `PUT`. Its other hits for direct `JWT_SECRET` reads are old copies of files this branch already fixed; they resolve on merge. The two new files in §2.4 do not.

---

## 8. Testing against Kanvaro

- Route tests live in `src/app/api/__tests__/` and follow one pattern: `jest.doMock` the auth helper, `PermissionService` and models, then `require` the route. Copy an existing file.
- Real role tables are used in the role-grant tests (`ROLE_PERMISSIONS`), so a role change that reopens an escalation fails them.
- The full suite (~250 files) can time out on the shared in-memory MongoDB under load. Run it in two batches:
  ```sh
  npx jest --maxWorkers=4 --testPathIgnorePatterns "src/lib/standup" "src/models" "/node_modules/"
  npx jest src/lib/standup src/models --maxWorkers=4
  ```
- Running `next dev` in the same folder as a `next start` build overwrites `.next` and breaks the running build. Use a separate checkout for a second server.

---

## 9. Shared helpers added on this branch

| Helper | Use |
|---|---|
| `lib/auth/jwt-secrets.ts` | `getJwtSecret()`, `getJwtRefreshSecret()` |
| `lib/auth-utils.ts` → `authenticateUserWithDocument()` | Sign-in plus the user document already loaded |
| `lib/permissions/permission-service.ts` → `hasPermissionIn`, `canAccessProjectIn` | Checks against permissions loaded once |
| `lib/permissions/role-grant-policy.ts` | Role-grant rules |
| `lib/api/update-fields.ts` | `pickFields()`, `rejectUnlessProjectMoveAllowed()` |
| `lib/time-tracking-report-scope.ts` | Report user scoping |
| `lib/test-management-scope.ts` | Test list project scoping |
| `lib/settings/secret-mask.ts` | Secret placeholder in settings |
| `lib/setup-guard.ts`, `lib/debug-guard.ts` | Setup lock, debug lock |
| `lib/text/escape-regex.ts` | Literal matching for user search text |
