# Stand-up Module — Phase 0 Findings

Pre-flight for the Kanvaro Sprint Stand-up Management Module (spec v1.0, 05 Aug 2026). See the implementation plan for the full phase breakdown and requirement-ID mapping. This document records what Phase 0 closed, the decisions it locked in, and the debt it deliberately left for later phases.

## 1. What shipped in this phase

| Area | Before | After |
|---|---|---|
| Test harness | No `jest.config.js`, no `test` script — the suite could not run at all | `jest.config.js` + `jest.setup.ts` + `npm test` / `test:watch` / `test:coverage`. Node is the default environment; component tests opt into `jsdom` per-file via a `@jest-environment jsdom` docblock |
| Type-check | `npm run type-check` failed with 24 errors, all in test files | 0 errors, exit 0 |
| Lint | `next lint` had never been configured — it prompted interactively and produced no output | `.eslintrc.json` (`next/core-web-vitals`) added; `next lint` now runs non-interactively and reports 64 errors / 122 warnings, all pre-existing |
| `getLoggedMinutes` | Did not exist — spec's own §23.2 names this the single largest project risk (R1) if per-day/per-member granularity is missing | `getLoggedMinutes`, `getLoggedMinutesBulk`, `getTotalLoggedMinutesForTask` added to `time-tracking-server.ts`, backed by a new `{ task, user, startTime }` index on `TimeEntry`. 12 tests, all green. **Risk R1 is closed.** |
| Status categorisation | `Project.settings.kanbanStatuses` had no semantic meaning — RUN-9's "done set"/"in progress set"/"blocked set" bucketing had nothing to key off | `category` field added (optional, back-compatible), plus `resolveTaskStatusCategory()` / `isDoneStatusCategory()` / `isClosedStatusCategory()` in `src/constants/taskStatuses.ts`. 9 tests, all green |
| Audit trail | `ActivityLog`'s action/entity enums were hard-coded twice (TS union + Mongoose schema array), with no standup vocabulary and no before/after convention | Enums collapsed to single source-of-truth arrays (`ACTIVITY_ACTIONS`, `ACTIVITY_ENTITY_TYPES`), extended with every standup entity/action the spec's SEC-3 requires, plus an `ActivityChangeDetails` shape (`before`/`after`) carried in the existing `details` field |
| Notifications | `Notification.type` / `data.entityType` had no standup vocabulary | Added `'standup'` to `type`, and `'standup' \| 'carry_forward_item' \| 'standup_override'` to `data.entityType` |

## 2. Assumption audit (spec §23.2)

The spec names six capabilities it assumes already exist. Each is marked below.

| # | Assumed capability | Status | Note |
|---|---|---|---|
| 1 | Tasks with configurable workflow, sprint entity, backlog, project membership | **Exists** | Verified in `src/models/Task.ts`, `Sprint.ts`, `Project.ts` |
| 2 | Time logging with per-member, per-task, per-date granularity — `getLoggedMinutes(taskId, memberId, dateRange)` | **Built this phase** | `TimeEntry.duration` was already integer minutes; only the query contract was missing. See §1 above |
| 3 | Leave and availability module | **Needs building** | No leave module exists. Per the plan's resolved gap #14, NFR-I2's manual-entry fallback on the Capacity & Members screen is the *primary* path for release one, not a fallback — deferred to Phase 1 |
| 4 | Platform notification service with per-user preferences | **Exists, needs extension** | `notification-service.ts` supports in-app/email/push with per-user prefs; enum extended this phase (§1) |
| 5 | Central audit service | **Exists, needs extension** | `ActivityLog` + `activity-logger.ts` exist; enums extended and a before/after convention added this phase (§1). A `logStandupMutation()` wrapper is Phase 1 scope so no stand-up service writes audit inline |
| 6 | Task workflow "done set" / "in progress set" configuration | **Built this phase** | `kanbanStatuses[].category` + `resolveTaskStatusCategory()`. See §1 above |

## 3. Product decisions (spec §23.3), adopting the spec's own recommendations

| # | Decision | Taken |
|---|---|---|
| D1 | Default overrun policy | `absorb` |
| D2 | Who sees individual estimate debt | Self + PM; team aggregates for everyone. **Closed now, before Phase 5's analytics payload is designed** — the spec calls this out as the decision that bites hardest if deferred |
| D3 | Block over-allocation outright? | No — override with acknowledgement |
| D4 | Carry debt between sprints | Off |
| D5 | Auto-assign suggestions | Rules-based, propose-never-apply |
| D6 | Fifteen-minute timer behaviour | Advisory only |

**Migration decision (spec §1.9 gap 1):** the module is opt-in per project via `projectStandupSettings.enabled`, and generation only applies to sprints that reach `Planned` after enablement. Sprints already `Active` at ship time are untouched — no migration script needed.

## 4. Infrastructure decisions written down, not yet built

Per the plan, these are recorded here so Phase 3 and Phase 7 build against a settled design rather than deciding mid-phase.

**Completion saga (replaces spec's NFR-6 MongoDB transaction).** Kanvaro runs standalone MongoDB, not a replica set — `startSession`/`withTransaction` do not appear anywhere in `src/`, and adding replica-set infrastructure is out of scope for this module. RUN-20/21 require nine sub-steps to succeed atomically or not at all; AC-26 tests that a forced failure leaves nothing persisted. The resolution: an ordered sequence of writes with a `completionState` checkpoint field on the `Standup` document, and an explicit compensating write for every step if a later one fails. Phase 7 writes the failure-injection test (forcing the ledger-write step to fail) **before** the happy-path test, per the plan's risk R1.

**Job pattern (replaces spec's persistent worker + per-project advisory locks).** Existing jobs are Next.js routes under `src/app/api/cron/`, invoked by `vercel.json` cron entries (finest existing cadence: `*/5 * * * *`). The stand-up module's seven jobs follow the same pattern: one route per job, each iterating projects **grouped by IANA timezone inside the route body** (satisfies NFR-J2 — no single global-midnight job — without one cron entry per project). An advisory lock is a `jobLock` document with a TTL index; idempotency is a `lastRunKey` per job. `bull` and `redis` are already dependencies if load ever demands a real persistent worker instead.

## 5. Known debt (pre-existing, out of scope for this module)

Turning the harness on for the first time surfaced failures that predate this work. None block Phase 1+; they're recorded so they aren't mistaken for stand-up regressions later.

**22 failing tests, never green before this phase, unrelated to stand-ups:**
- `permission-system.test.ts` (12 failures) — `PermissionService.getUserPermissions` now calls `User.findById(id).populate('customRole')`; the tests mock `findById` to resolve a plain object, so `.populate` isn't a function. Stale against the current implementation.
- `loader.test.ts` (5) — fs-mock call-count expectations don't match the current docs loader's caching behaviour.
- `completion-service.test.ts` (3) — assertions against a call shape the service no longer produces.
- `permission-context.test.tsx` (2) — fetch-mock/async-timing races.

**Lint debt surfaced by the new `.eslintrc.json`:** 64 errors / 122 warnings, entirely pre-existing. Two are real bugs worth flagging for a future fix, found only because lint could finally run:
- `src/components/time-tracking/Timer.tsx` — three conditional hook calls (`useEffect` ×2, `useCallback` ×1) after an early return. Violates the Rules of Hooks; can desync hook state across renders.
- `src/components/tasks/ViewTaskModal.tsx` — one conditional `useDateTime()` call, same class of bug.

Everything else is `react-hooks/exhaustive-deps` (98), `react/no-unescaped-entities` (59), and `@next/next/no-img-element` (21) — style/lint-only, no behavioural risk.

## 6. Verification

```
npm run type-check   # 0 errors, exit 0
npm test              # 80 tests: 58 pass (all new/touched work), 22 pre-existing failures (§5)
npm run lint           # runs non-interactively; 64 errors / 122 warnings, all pre-existing (§5)
```

## 7. Exit criteria (plan §Phase 0)

- [x] `npm test` runs (harness was the blocker; it now executes end to end)
- [x] `npm run type-check` clean
- [x] Written note per §23.2 assumption (§2 above)
- [x] D1–D6 and the migration decision recorded (§3)
- [x] Completion-saga sequence and cron job pattern written down (§4)

Phase 0 is complete. Phase 1 (working calendar engine and capacity model) can proceed against this baseline.
