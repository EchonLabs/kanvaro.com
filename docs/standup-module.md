# Sprint Stand-up Module

The stand-up module turns the daily stand-up from a status meeting into a planning instrument. A stand-up in Kanvaro is not a note-taking surface; it is a gate. Each working day of a sprint gets its own stand-up record, every team member's day is filled against a computed capacity, yesterday's plan is compared against what actually happened, and the day cannot be closed until eleven checks pass or a project manager knowingly overrides the ones that may be overridden.

Two ideas carry the whole design:

**Eight hours must be filled.** A member's available minutes for a date are computed from the working calendar, their own capacity record, ceremonies, leave and outstanding estimate debt. Allocation is then the act of placing real tasks against that number until the gap closes. A day that is half-planned is a visible failure state, not an empty screen.

**Estimates are answered, not forgotten.** When a task overruns its estimate, the overrun becomes an append-only ledger entry against the member — *estimate debt* — which reduces tomorrow's available capacity under the default policy. The module's purpose is to make the gap between what was estimated and what happened impossible to leave unexplained.

This document describes what the code does today. Where the implementation deviates from the specification, or where something is specified and not built, that is stated in place rather than smoothed over. [What is not built](#what-is-not-built) collects the gaps.

## Contents

- [Scope and related documents](#scope-and-related-documents)
- [Vocabulary](#vocabulary)
- [Cross-cutting rules](#cross-cutting-rules)
- [A sprint, end to end](#a-sprint-end-to-end)
- [Data model](#data-model)
- [Calendar and capacity](#calendar-and-capacity)
- [Planning gate and estimation](#planning-gate-and-estimation)
- [Allocation](#allocation)
- [Attendance and detachment](#attendance-and-detachment)
- [Variance and estimate debt](#variance-and-estimate-debt)
- [Carry-forward register](#carry-forward-register)
- [Blockers](#blockers)
- [Completion checks](#completion-checks)
- [Overrides](#overrides)
- [Final day and sprint close](#final-day-and-sprint-close)
- [Missed, backfilled and reopened stand-ups](#missed-backfilled-and-reopened-stand-ups)
- [Scheduler and background jobs](#scheduler-and-background-jobs)
- [Notifications](#notifications)
- [Degradation contract](#degradation-contract)
- [Permissions](#permissions)
- [API surface](#api-surface)
- [Error catalogue](#error-catalogue)
- [Screens](#screens)
- [Code map](#code-map)
- [Configuration](#configuration)
- [Testing](#testing)
- [Operations](#operations)
- [What is not built](#what-is-not-built)

## Scope and related documents

The module is **opt-in per project**. `ProjectStandupSettings.enabled` defaults to `false`, and stand-up generation only applies to sprints that reach `Planned` after a project enables it. There is no migration script and none is needed — an existing install that never enables the module is unaffected by all of it.

The specification (`Kanvaro-Standup-Module-Spec-v1.0`) is the requirements document, and its identifier prefixes are used throughout the code and this page:

| Prefix | Area |
|---|---|
| `SCH-` | Schedule, generation, lifecycle |
| `RUN-` | The run screen and the meeting itself |
| `ALO-` | Allocation |
| `CAL-` | Working calendar |
| `PLN-`, `PC-`, `PA-` | Planning gate, checklist, advisories |
| `VAR-` | Variance and estimate debt |
| `CFW-` | Carry-forward register |
| `CC-` | Completion checks |
| `OVR-` | Overrides |
| `N-` | Notifications |
| `DAT-` | Data invariants |
| `SEC-`, `NFR-` | Security, non-functional requirements |
| `AC-`, `E-` | Acceptance criteria, edge cases |

Reading a `RUN-15` or `CC-6` comment in the code and wanting the original wording means going to the spec. This page does not restate it; it documents the implementation.

Related pages: [Background jobs](#scheduler-and-background-jobs) below replaces the former `operations/background-jobs` page. The route-placement conventions this module follows are summarised under [API surface](#api-surface).

## Vocabulary

| Term | Meaning |
|---|---|
| **Stand-up** | One record per working day of a sprint. Carries its own date, scheduled time, facilitator, attendance, status and optimistic-concurrency `version`. |
| **Shape** | `day_one`, `mid_sprint` or `final_day`. Decided by working-day ordinal, not calendar date. Shape controls which panels render and which checks apply. |
| **Allocation** | One member committing a number of minutes to one task on one stand-up. Distinct from task assignment: a task can be assigned for the sprint and allocated on four separate days. |
| **Capacity** | The minutes a member actually has on a date, after the calendar, ceremonies, leave, partial attendance and estimate debt are applied. |
| **Variance** | The comparison of one allocation's planned minutes against the minutes actually logged, classified into exactly one of twelve outcomes. |
| **Estimate debt** | Append-only ledger of overruns and credits per member per sprint. Under the default `absorb` policy, outstanding debt reduces tomorrow's effective capacity. |
| **Carry-forward item** | A durable obligation — unfinished task, unrevised estimate, open blocker, absent owner — that survives the stand-up that raised it and ages until resolved. |
| **Completion check** | One of eleven `CC-*` gates evaluated before a stand-up may be completed. Some are hard blocks, some warn, some may be overridden. |
| **Override** | A project manager knowingly accepting a failing check, with a reason code and a justification of at least twenty characters, recorded as its own document. |
| **Degradation** | A deliberately-descoped capability announcing its own absence on screen, rather than appearing as software that quietly does nothing. |

## Cross-cutting rules

These hold across every file in the module. A change that breaks one of them is a defect, not a trade-off.

1. **Integer minutes everywhere.** Every domain function takes and returns `Minutes` (`src/lib/standup/minutes.ts`). Floats appear only at the display boundary, in `formatMinutesAsHours()`. A service signature carrying float hours is a defect (`DAT-2`).
2. **No new hard infrastructure dependency.** The module runs on `docker-compose up` with a standalone `mongo:6.0` and no Redis. `src/lib/redis.ts` throws when `REDIS_URL` is unset, so nothing in the module imports it.
3. **No MongoDB transactions.** Kanvaro's connection string is user-supplied and may point at a standalone `mongod`, so multi-document transactions cannot be assumed. Every multi-step write is an idempotent, resumable saga instead — see [the completion saga](#completion-checks).
4. **`resolveWorkingDay()` is the single source of calendar truth** (`CAL-1`). No other code implements weekend, holiday or partial-day logic.
5. **Server-side permission enforcement on every route**, through `permission-middleware.ts` and `route-helpers.ts`. Hiding a UI control is never sufficient (`SEC-1`, `NFR-11`).
6. **Every mutation writes an audit entry** through `recordAudit()` (`src/lib/standup/audit.ts`) — actor, UTC timestamp, entity, action, before and after. No service calls `logActivity` or `ActivityLog.create` directly (`SEC-3`, `NFR-12`).
7. **Append-only ledgers.** Estimate-debt corrections are new entries, never edits or deletes, enforced by model-level hooks that throw on every update and delete method (`DAT-4`).
8. **`originalEstimateMinutes` is immutable** once `estimateLockedAt` is set, enforced in a Mongoose hook rather than only at the API layer (`DAT-6`).
9. **All user-facing strings live in `src/lib/standup/strings.ts`** (`standupStrings`). Full internationalisation is descoped; centralisation is not. No inline string literals in components.
10. **Every descoped capability degrades loudly.** A silent absence is a plan violation — see [Degradation contract](#degradation-contract).
11. **Pure rules separate from database access.** The convention is a pure module beside a service that loads for it: `working-day.ts`/`calendar-service.ts`, `allocation.ts`/`allocation-service.ts`, `variance.ts`/`variance-service.ts`, `carry-forward.ts`/`carry-forward-service.ts`, `sprint-close.ts`/`sprint-close-service.ts`. The pure half is where the rules are tested.
12. **Read models are derived, never authoritative.** `MemberSprintDebtSummary` is a discardable aggregate rebuildable from the ledger; the ledger is the only source of truth (`DAT-5`).

## A sprint, end to end

**1. Configure.** A project manager enables the module on the project's Stand-ups tab and sets the stand-up local time, duration, lead times, tolerances and policies. The working calendar and per-member capacity are configured on the same tab.

**2. Plan the sprint.** Planning poker estimates the sprint's tasks; the planning checklist's mandatory `PC-1`…`PC-7` items must pass, and advisory `PA-1`…`PA-6` items must at least be acknowledged. Completing planning locks each task's `originalEstimateMinutes`. A stand-up refuses to start against a sprint that has not passed this gate (`AC-5`) — the refusal can be waived explicitly by a role holding `standup:planning_waiver`, never bypassed silently.

**3. Generate the schedule.** The sprint reaching `Planned` generates one stand-up per working day, with `day_one`/`mid_sprint`/`final_day` shapes assigned by working-day ordinal. Generation is idempotent: a second call against the same sprint creates nothing. Non-working days become visible `Skipped_Holiday` rows rather than absences.

**4. Each morning.** `promote-to-ready` moves the stand-up from `Scheduled` to `Ready` at its lead time and builds its read-only snapshot. `send-reminders` sends the `N1` reminder to every expected attendee.

**5. Run the meeting.** The project manager opens the run screen and clicks Start, which transitions to `In_Progress`. The screen's seven panels are worked in order: attendance, yesterday's review, variance, carry-forward, allocation against the capacity board, blockers, and the completion gate. Every write carries the stand-up's `version` in an `X-Standup-Version` header; a mismatch is refused with `STALE_STANDUP` rather than overwriting another facilitator's edit.

**6. Complete.** The completion checks are evaluated on the server, from data the server loaded itself — a client payload never decides whether a check passed. Passing (or overriding what may be overridden) runs the completion saga, which persists variance rows, posts ledger entries, builds the carry-forward set, writes the summary document and sends notifications, recording a checkpoint after each step.

**7. Final day.** The last working day adds a sprint-close readiness panel. Every open task needs a disposition and every open carry-forward item needs a resolution before Complete enables.

## Data model

All collections are organisation- and project-scoped. Fields below are the load-bearing ones, not an exhaustive schema dump — read the model file for that.

| Collection | Purpose | Key constraints |
|---|---|---|
| `Standup` | One per working day per sprint. | Unique `{sprint, standupDate}`. `version` for optimistic concurrency. `completionState` holds the saga checkpoint. Embedded `attendance[]`. |
| `Allocation` | A member's committed minutes on one task on one stand-up. | **Partial** unique index on `{standup, member, task}` filtered to `{detachedReason: null}`, so a reassignment can coexist with a detached row. `plannedMinutes` must be a whole number ≥ 1. |
| `AllocationVariance` | One row explaining one allocation, written at completion. | Unique per `allocation`. Carries the classified `outcome`, `overrunMinutes`, `creditMinutes`. |
| `EstimateDebtLedger` | Append-only debt movements. | Unique sparse `{sourceAllocation, entryType}`; second unique-partial index on `{sourceStandup, member, entryType}` restricted to `settlement`/`carry_in`. Update and delete hooks throw. |
| `MemberSprintDebtSummary` | Derived per-member totals. | Rebuildable; never authoritative. |
| `CarryForwardItem` | Durable obligations with an append-only note thread. | Nine item types, seven statuses, a resolution record, provenance `tags[]`. |
| `StandupBlocker` | Impediments raised in the meeting. | Description ≥ 10 characters; `resolutionNote` ≥ 10 characters required when resolving. |
| `StandupOverride` | A knowingly-accepted check failure. | `justification` ≥ 20 characters, enforced at the model as well as the service. |
| `StandupSummary` | The persisted record of a completed stand-up. | Unique per `standup`. Drives the summary screen and markdown export. |
| `ProjectStandupSettings` | Per-project configuration. | See [Configuration](#configuration). |
| `MemberCapacity` | Per-member working hours, leave, non-project commitments. | Consumed by `computeCapacity`. |
| `WorkingCalendar` | Per-project working days and overrides. | The project half of `resolveWorkingDay()`. |
| `HolidaySet` / `Holiday` | Organisation-wide, perpetual holiday data. | Holidays are **revoked**, never deleted — see [Calendar and capacity](#calendar-and-capacity). |
| `PokerSession` / `SprintPlanningSession` | Planning poker and the planning gate's state. | |
| `JobLock` / `JobHeartbeat` | Scheduler advisory locking and liveness. | `JobLock` has a TTL index (`expireAfterSeconds: 0`). |

Two fields live on existing models rather than new ones:

- **`Task.standupOwner`** — `Task.assignedTo` is an array, but variance needs a single owner, or a shared task double-counts its ledger accrual. It defaults to `assignedTo[0]` **at read time only**, through `resolveStandupOwner()`; it is deliberately not a schema default, which would silently pick a winner from an unordered array on every legacy row. Only the owner's allocation carries `taskVarianceMinutes` and posts task-level accrual; a non-owner's allocation is flagged `sharedContribution` and accrues its own day variance only.
- **`Task.sprintCloseDisposition`** — one of `finish_today`, `descope`, `move_to_next_sprint`, `split_and_move_remainder`. It has no fallback resolver, unlike `standupOwner`, because "not yet dispositioned" is exactly the state that must block final-day completion.

### Stand-up status machine

`Scheduled` → `Ready` → `In_Progress` → `Completed`, with `Reopened`, `Missed`, `Skipped_Holiday` and `Cancelled` as the other terminal or exceptional states. The transitions live in `lifecycle.ts` (`assertStartable`, `assertReopenable`); nothing else writes `status` directly.

A completed stand-up is immutable. Capacity resolves as of its own `standupDate` and is frozen into the record, so later calendar edits cannot rewrite it (`DAT-1`). `displayedDayNumber` is frozen at completion for audit while day numbers are otherwise always recomputed rather than stored as truth.

## Calendar and capacity

`resolveWorkingDay(date)` is the only answer to "is this a working day, and how long?" It combines the project's `WorkingCalendar`, organisation holiday sets, per-member exceptions and partial days. Everything else in the module calls it.

**Capacity** is computed by `computeCapacity()` into a `CapacityBreakdown`:

```
nominalMinutes          the member's standard day
  × partial-day scaling
  − adjustments[]       leave, ceremonies, non-project commitments, member exceptions
  = adjustedMinutes     floored at zero
  − outstandingDebt     when overrunPolicy is 'absorb'
  = effectiveMinutes    what may actually be allocated today
  − allocatedMinutes
  = gapMinutes          positive means the day is not full
```

Adjustments are **itemised, never lumped**: each is its own `{type, label, minutes}` entry, so the member drawer can explain the day line by line. An aggregated "meetings −90m" row is treated as a defect.

`status` is one of `full`, `under`, `over`, `zero`, `unavailable`. Because `unavailable` is decided before allocated minutes are even looked at, a separate `strandedMinutes` field reports hours still sitting on a member who has no capacity to do them — six stranded hours and an empty day would otherwise render identically.

### Ceremonies

Recurring sprint ceremonies (review, retro, demo) reduce capacity and **never become allocations** — an allocation must point at a task, and a meeting is not a task. Two sources feed in: `SprintEvent` occurrences for this project's own ceremonies, and `MemberCapacity.nonProjectCommitments[]` for recurring load outside it.

Three rules worth knowing:

- A ceremony deducts only from its own `attendees[]` plus the facilitator. An event with an empty `attendees[]` deducts from nobody and raises a configuration warning.
- `daily_standup` events are explicitly excluded from the ceremony sum, because the stand-up's own duration already deducts once. Without that exclusion every member's day would silently shrink twice and the numbers would still look plausible.
- Cancelled events deduct nothing, and moving an event after a stand-up completed does not retroactively alter it.

`ceremoniesConsumeCapacity` defaults to `true`; turning it off surfaces a notice in the capacity breakdown so the choice stays visible.

### Holidays

`HolidaySet` is perpetual, not per-year, and holiday administration is organisation-scoped — a holiday set is shared by every project, so `HOLIDAY_MANAGE` is an organisation-wide permission held by Admin and Human Resource rather than a project one.

**Holidays are updated and revoked, never deleted.** `resolveWorkingDay()` is dated, so deleting a holiday row would silently rewrite the capacity of every completed stand-up around it. Revoking sets `revokedAt`/`revokedBy`/`revokeReason` (≥ 20 characters). Revoking or editing a date underneath a `Completed`, `Missed` or `Reopened` stand-up is refused with `IMMUTABLE_COMPLETED_STANDUP`, naming the blocking stand-ups.

**Coverage is derived, never stored.** There is no `coverageUntil` field; coverage is `max(date)` over active holidays, computed at read time, because a stored field goes stale exactly when it matters. A sprint whose range extends past loaded coverage raises `HOLIDAY_COVERAGE_GAP` as a warning at generation time and on the schedule hub, linking to the import screen.

## Planning gate and estimation

A stand-up cannot start against a sprint whose planning is incomplete (`AC-5`), enforced by `assertPlanningGate`/`evaluatePlanningGate` in `planning-gate.ts`, composed into `startStandup()`.

**Planning poker** (`poker.ts`) runs a session per task: participants vote, the facilitator reveals, and the spread is discussed. Outliers are marked by distance from the median rather than by being the extreme values, so a tight cluster with one far vote flags the far vote and a genuinely split room flags both sides. Reveal state is served by a read-only `GET .../reveal-state` route polled by every client, so every voter sees the spread — not only the facilitator who pressed reveal.

**The checklist** (`planning-checklist.ts`) holds mandatory `PC-1`…`PC-7` items and advisory `PA-1`…`PA-6` items. `completePlanning` checks both: unacknowledged advisories block completion (`E19`), so a sprint cannot be planned at 200% of capacity with no acknowledgement on record.

**Estimates lock at planning.** Once `estimateLockedAt` is set, `originalEstimateMinutes` is immutable at the model layer. Revisions after that point change `remainingEstimateMinutes` and are recorded as revisions with a reason — the original is what variance measures against.

**Points migration.** A project changing its `pointsToHours` factor goes through `points-migration.ts`, which previews the effect on every estimated task before applying it (`PLN-14`, `E17`).

## Allocation

`allocation-service.ts` is the **only** writer of `Allocation`, and it returns the member's fully recomputed `CapacityBreakdown` on every mutation — so the board never drifts from the numbers completion will check.

**The default allocation** (`ALO-5`) is `min(remainingEstimate, gap)`, floored at 15 minutes and never zero. When the gap is zero or negative the service falls back to prompting for an over-allocation rather than silently writing a zero-minute row.

**Pre-fill** (`prefill.ts`, `ALO-10`…`ALO-12`) plans day-one and carry-forward allocations automatically. Every skip carries a closed-union reason, so an empty plan is never indistinguishable from a broken one. A ceremony input produces a *skip*, never an allocation.

`source` records how a row arrived: `pre_assigned`, `assigned_in_standup`, `carried_forward`, `auto_prefilled`, `self_selected`.

**Over-allocation is never blocked outright** (product decision D3) — it requires an override with the affected member's acknowledgement. Only a project explicitly configured to refuse it answers `CAPACITY_EXCEEDED`.

**Drag-and-drop is a second entry point to one write path, never a second path.** The `@dnd-kit` handlers call the identical mutation function the keyboard quick-add calls, and the keyboard path stays fully functional throughout (`NFR-A2`).

## Attendance and detachment

Attendance states are `present`, `absent_planned`, `absent_unplanned` and `partial`. Everyone defaults to present, and an unrecorded member is **assumed present** until somebody says otherwise (`RUN-6`) — rendered as unset rather than as an affirmative tick. `partial` is not absence; a partial day still has hours to give, carried in `partialMinutes`.

Marking a member absent **detaches** their allocations rather than deleting them: `excludedFromCapacity = true` and `detachedReason: 'owner_absent'`, then a bulk "reassign N open tasks?" prompt. `detachedReason` is a distinct field from `excludedFromCapacity` rather than an overload of it, because "blocked, deliberately not allocated" and "the owner isn't here" carry forward differently and the classifier has to tell them apart.

Completion then sweeps `detachedReason: 'owner_absent'` rows into the carry-forward register with the matching tag. Leave entry is project-manager-only in this release — there is no approval workflow, so the specification's "PM or the member with approval" collapses to the PM, with the member view rendering leave read-only.

## Variance and estimate debt

This is the reason the module exists. `variance.ts` is a pure, re-runnable classifier used twice: **provisionally** in memory to render today's board, and **persistently** at completion when `variance-service.ts` writes one `AllocationVariance` per allocation and posts ledger entries. Both paths share one private assembler, which is what makes "what the PM saw at 09:15" structurally equal to "what the ledger recorded at 09:30" rather than a hope.

### The twelve outcomes and their precedence

Specification conditions overlap, and `VAR-2` demands exactly one outcome per row, so precedence is decided once and documented in the file:

| Rank | Outcome | Notes |
|---|---|---|
| 1 | `descoped` | Beats everything. |
| 2 | `owner_absent` | Posts **no** overrun and no credit — the person was not there. |
| 3 | `blocked` | A blocker is not an overrun. |
| 4 | `no_time_logged_but_progressed` | Zero logged but status advanced. A warning, no debt. |
| 5 | `not_started` | Zero logged otherwise. Ranks **above** the done branch so a zero-hour close is never classified `delivered_under` and handed a credit for work no timesheet shows. |
| 6 | `delivered_under` / `delivered_on_estimate` / `delivered_over` | Task done. Logged against planned at the configured tolerance. |
| 7 | `reassigned` | Below the done branch — a reassigned-and-finished task is still a delivery. |
| 8 | `open_under_consumed` / `open_fully_consumed` / `open_over_consumed` | Still open. A revision is mandatory when the remaining estimate hits zero while the task is not done. |

Tolerance is `underToleranceMinutes`/`overToleranceMinutes`, both 15 minutes by default. The boundary tests fail if any `<=` comparison is loosened to `<`.

### The ledger

`EstimateDebtLedger` entry types are `accrual`, `credit`, `settlement`, `writeoff` and `carry_in`. The ledger is append-only, enforced by `pre` hooks on every update and delete method that throw. Corrections — including `recomputeAfterCompletion` for retrospectively-logged time (`E40`) — post as **new** rows with distinct provenance, never as edits.

Debt arithmetic (`debt.ts`) floors outstanding debt at zero for display: a negative balance is **surplus**, rendered as "ahead of estimate", never as negative debt.

**Logged time** (`time-logs.ts`) is the one place "how many minutes did this member log on this task on this date" is answered. The window is computed in the project's timezone, and it deliberately does **not** filter on `isApproved` — approval is a billing workflow, and a stand-up must reflect this morning's reality rather than a manager's sign-off.

Debt does not carry between sprints by default (`carryDebtBetweenSprints: false`, product decision D4). Individual debt is visible to the member and the project manager; team aggregates are visible to everyone (D2). `NFR-13` is verified against the API payload, not just the UI — a Stakeholder cannot retrieve individual debt by calling the route directly.

## Carry-forward register

`CarryForwardItem` makes "the same excuse five days running" visible. Nine item types: `unfinished_task`, `unrevised_estimate`, `open_blocker`, `owner_absent`, `unassigned_task`, `missed_standup_rollup`, `override_followup`, `not_started_commitment`, `cross_sprint`.

Seven statuses: `open`, `noted`, `escalated` (the three that mean an item is still live), then `resolved`, `closed_descoped`, `closed_reassigned`, `closed_sprint_end`.

`tags[]` records provenance independently of `type`: `owner_absent`, `chronic`, `from_missed_standup`, `cross_sprint`.

**Notes are append-only and must say something new.** A note needs at least 10 characters *and* must differ from the previous note, else `NOTE_UNCHANGED`. Ageing bands are pure (`carry-forward.ts`); `carryForwardNoteThreshold` (default 3) and `carryForwardEscalationThreshold` (default 5) drive when a note becomes required and when the item escalates.

`buildCarryForwardSet` runs on **two different clocks** deliberately: board-level facts come from today's allocations, but `open_under_consumed`/`open_fully_consumed`/`not_started` obligations come from the classifier's one-day lag. Conflating the two would misdate items.

The nightly `escalate-carry-forward` job is the `NFR-8` safety net: it re-attaches an item stuck on a stand-up that stopped being current, and fires the `N9` escalation once on the crossing tick rather than repeatedly.

## Blockers

`StandupBlocker` gives impediments their own entity rather than folding them into carry-forward tags. Types are `dependency`, `external_party`, `technical`, `resource`, `decision_needed`, `environment`, `other`; severities `low` through `critical`; statuses `open`, `in_progress`, `resolved`, `wont_resolve`.

`blocker-service.ts` owns raise, update and resolve. Raising a blocker wires `Allocation.isBlocked` and reads `ProjectStandupSettings.blockedTasksConsumeCapacity` to decide `excludedFromCapacity` — the setting is honoured by the service, not by a caller-supplied flag. Resolving auto-closes the linked `open_blocker` carry-forward item.

## Completion checks

`completion-checks.ts` is pure: given the board as the server sees it, it returns one result per check in specification table order, and `blockingFailures()` decides whether Complete may enable. All eleven are answered — none is left `not_evaluated`.

| Check | Subject | Hard | Overridable |
|---|---|---|---|
| CC-1 | Every present member's day is filled | yes | yes |
| CC-2 | No duplicate allocation of a task | yes | yes |
| CC-3 | Re-estimates have been answered | yes | yes |
| CC-4 | Carry-forward items have the required notes | yes | no |
| CC-5 | Every allocation's task is estimated | yes | yes |
| CC-6 | No member is over-allocated | yes | yes |
| CC-7 | Attendance is recorded | yes | no |
| CC-8 | Final day: every open task has a disposition | yes | no |
| CC-9 | Blockers are reviewed | no (warns) | no |
| CC-10 | Unassigned pool is worked | yes | yes |
| CC-11 | Sprint health: projected burn vs. capacity | no (warns) | no |

`CFW-9` — every open carry-forward item has a final-day resolution — is a **separate** gate on the same Complete button, not a twelfth check. It governs a different subsystem with its own resolution vocabulary, so a sibling pure function evaluates it and its failures are unioned into the same `blocking` array rather than inventing a twelfth `CheckId`.

Checks are evaluated **twice**: provisionally in the browser to drive the button, and authoritatively on the server inside `POST /complete` from data the server itself loaded. A stale or tampered client payload never decides whether a check passed.

### The completion saga

Completion is a `runSaga` sequence keyed by `completionRunId`, with the last-completed step name recorded in `Standup.completionState`. A re-run resumes rather than repeats. Each step must still be independently idempotent, because a crash between a step's write and its checkpoint save re-runs that step — which is why the unique indexes on `AllocationVariance.allocation` and the debt ledger exist.

A double-submit answers `STANDUP_ALREADY_COMPLETED`, not a duplicate summary. An interrupted run surfaces `COMPLETION_INTERRUPTED` with a working resume action — that banner is the loud degradation standing in for the transaction the platform cannot offer.

## Overrides

Five issuable types: `under_allocation`, `over_allocation`, `skip_reestimate`, `duplicate_allocation`, `complete_with_absent_facilitator_role`.

A shared `validateJustification()` enforces ≥ 20 characters, rejects whitespace- and punctuation-only input, and rejects a configurable low-value list (`"n/a"` and friends) — used identically client- and server-side. Reason codes are per type, so a project manager deferring a re-estimate is offered reasons that describe that decision (`owner_unavailable`, `needs_investigation`, `awaiting_dependency`, `will_split_task`, `other`) rather than the under-allocation list.

The hard-block-only checks render **no control at all**, and the API refuses them directly with `OVERRIDE_NOT_PERMITTED` if called anyway, rather than silently accepting a no-op.

Two behaviours worth knowing:

- **`skip_reestimate` is scoped and single-use.** It creates a linked `override_followup` carry-forward item and refuses a second consecutive deferral on the same task: "This estimate has already been deferred once. Revise it now."
- **Chronic under-allocation escalates.** `detectChronicUnderAllocation` walks a member's last three consecutive stand-ups and fires `N7` once the third under-allocation override lands, regardless of how well each individual day was justified.

The run screen loads the overrides **already on record** with the checks payload, not only the ones issued since the page loaded — a reload used to re-block a check the saga would happily pass, and for `CC-3` the second attempt was refused outright as "already deferred once", stranding the project manager.

## Final day and sprint close

The final working day adds the sprint-close readiness panel, governed by two independent gates: `CC-8` on task dispositions and `CFW-9` on carry-forward resolutions.

`sprint-close.ts` is pure — `computeProjectedOutcome`, `evaluateTaskDispositions`, `evaluateFinalDayCarryForwardDisposition`. Projected outcome is a pure function of remaining estimate against hours available today and is **never persisted**; like capacity it is cheap to recompute, and a stored value would go stale the moment any allocation changed.

Task owner names on the panel resolve through `resolveStandupOwner()` — the single existing "who owns this task" rule — never a fresh `assignedTo[0]` guess.

## Missed, backfilled and reopened stand-ups

**Missed.** `mark-missed` moves an overdue `Scheduled` or `Ready` stand-up to `Missed` at the project's local end of day and rolls its obligations forward. Consecutive misses escalate through `N8` on the second and third.

**Backfill** (`SCH-14`, `E49`) reconstructs a missed day within `backfillWindowWorkingDays` (default 2). It collects attendance, detaches absentees' allocations idempotently across retries, and runs the full completion saga.

Backfill cannot fabricate consent, so what a facilitator may attest to is restricted:

- `skip_reestimate` (`CC-3`) **cannot** be attested. The override is scoped to exactly one task and may happen once; a blanket attestation would create a carry-forward item, still fail the gate, and be permanently unable to succeed on a retry. Re-estimates have to be answered.
- `over_allocation` (`CC-6`) **can** be attested, but only with the facilitator's explicit confirmation that the affected members agreed. Without it the call is refused with `VALIDATION_FAILED` on field `memberAcknowledged`, **before anything is written**. The backfill audit entry records `memberAgreementAttestedFor`, so nobody later reads the override's `memberAcknowledged` as consent that was actually given. This exists because allocations cannot be edited on a `Missed` stand-up, which previously left an over-allocated missed day with no way through at all.

Relatedly, `MUTABLE_STATUSES` in `revision-service.ts` includes `Missed` on purpose: refusing re-estimate answers on a missed day made every missed non-day-one stand-up with an overrun permanently unbackfillable. The answers write to the task and to yesterday's allocation, never to the missed day's own record, so `Missed` stays immutable everywhere else. `Cancelled` is still refused.

**Reopen** (`RUN-4`/`RUN-5`) is available within `reopenWindowHours` (default 24) and triggers downstream recalculation. Outside the window it answers `REOPEN_WINDOW_EXPIRED`.

**Calendar changes.** `reconcile.ts` applies a schedule change across a sprint's stand-ups, planned by `reconcile-rules.ts`, which reuses the calendar impact analysis and **never re-derives a disposition**. Nine triggers (`sprint_start_earlier`/`later`, `sprint_end_earlier`/`later`, `date_became_non_working`/`working`, `standup_time_changed`, `project_timezone_changed`, `sprint_cancelled`) are proven against all eight statuses as a table-driven matrix. A trigger that would destroy a completed stand-up throws and writes nothing. Exactly one consolidated `N10` notification fires per calendar change, never one per affected stand-up.

## Scheduler and background jobs

The module depends on work that happens without anyone clicking anything: promoting a stand-up to Ready, sending reminders, marking an overdue stand-up Missed, repairing a drifted schedule, escalating carry-forward items and recomputing sprint health.

**If you run Kanvaro with Docker, there is nothing to configure.** This section matters for two cases: serverless deployments, and locking down the job URLs.

### What runs

| Job | Frequency | What it does |
|---|---|---|
| `promote-to-ready` | every 5 minutes | Moves a `Scheduled` stand-up to `Ready` at its lead time, builds its snapshot, sends `N2` |
| `send-reminders` | every 5 minutes | Sends the `N1` reminder at the configured lead time |
| `mark-missed` | hourly | Moves an overdue stand-up to `Missed`, rolls obligations forward, escalates via `N8` |
| `generation-audit` | daily | Finds active sprints with missing stand-ups and repairs them |
| `escalate-carry-forward` | daily | Re-attaches stranded items and escalates aged ones via `N9` |
| `sprint-health` | daily | Recomputes projected burn and warns via `N12` when scope exceeds remaining capacity |

A seventh name, `readmodel-refresh`, is declared in `STANDUP_JOB_NAMES` but has no registered implementation — there is nothing to refresh while the board view is computed live. The runner treats an unregistered name as a **skip, not an error**, so the ticker is unaffected.

Every job is a pure `(now) => Promise<JobResult>` function, so it can be driven by the ticker, by an HTTP route or by a test without knowing which. Locking, heartbeats and logging live in the runner, not in the jobs.

Every job is safe to run twice and safe to run concurrently: each takes a short-lived advisory lock in a `JobLock` collection with a TTL index, so two application instances ticking at the same moment produce one execution. **Locks are in Mongo, never Redis** — `src/lib/redis.ts` throws when `REDIS_URL` is unset, so a Redis-backed lock would make the whole scheduler optional. Each job also resolves every project's *local* time itself; there is no single global midnight, so a project in Colombo and one in Berlin both get their stand-ups at the right hour.

### How they are driven

**Self-hosted (the default).** The application process runs an in-process ticker, started from `src/instrumentation.ts`, that wakes every 60 seconds and runs any due job. Nothing to install, no extra container, no Redis. A slow tick cannot overlap the next one, and the timer is `unref`'d so a container still exits on `SIGTERM`.

Confirm it started from the container logs:

```json
{"event":"standup.scheduler.started","at":"2026-08-24T05:29:26.612Z","intervalMs":60000,"jobs":7}
```

Each run then writes its own structured line:

```json
{"event":"standup.job.run","at":"...","job":"mark-missed","ok":true,"durationMs":412,"scannedProjects":12,"created":0,"skipped":9,"repaired":1,"errorCount":0}
```

These logs are the observability story. Metrics and alerting are descoped; structured job logs were promoted into the platform phase instead, because a scheduler you cannot watch is unshippable.

**Serverless (for example Vercel).** There is no long-lived process for a ticker to live in, so the platform's scheduler calls the jobs over HTTP at `/api/cron/standup/[job]`. Set:

```bash
KANVARO_INTERNAL_SCHEDULER=false
```

Unset means the internal ticker runs, which is what you want anywhere else. Only an explicit `false` turns it off.

> **Note:** `vercel.json` currently declares crons for `promote-to-ready`, `send-reminders`, `mark-missed` and `generation-audit` only. `escalate-carry-forward` and `sprint-health` are **not** declared there, so on a serverless deployment they will not run until they are added.

### Liveness

`SCHEDULER_STALE` fires when the newest **scheduler** heartbeat (job name `__scheduler__`) is older than 15 minutes. It deliberately measures the ticker's own liveness, not the newest job's: a job row means a job had work to do and says nothing about whether the ticker is alive, and until the first job is registered there are no job rows at all.

### "Stand-ups are not being promoted automatically"

1. **Check the logs for `standup.scheduler.started`.** If absent, the ticker never began. On a serverless deployment that is expected — confirm the platform's cron is calling `/api/cron/standup/*` instead.
2. **Check whether `KANVARO_INTERNAL_SCHEDULER=false`** on a deployment with no external cron. That combination means nothing drives the jobs.
3. **Check for `standup.job.run` lines with `"ok":false`.** The `errors` array names the projects that failed and why.
4. **Restart the application.** The ticker starts with the process; a crash during boot can leave the server serving requests without it.

The notice clears on its own once a job runs successfully.

### Locking down the job URLs

`CRON_SECRET` is **enforce-if-set, never required**:

```bash
CRON_SECRET=<a long random string>
```

Set, the `/api/cron/*` endpoints require a matching `Authorization: Bearer` header and answer `401` otherwise, compared in constant time. Unset, they behave exactly as they always have — which is why upgrading Kanvaro never requires an environment change. On Vercel, setting the variable is the whole configuration; the platform attaches the header automatically.

The same check was retrofitted onto the three pre-existing cron routes (`timer-cleanup`, `notification-cleanup`, `event-reminders`), two of which are destructive and were previously always open.

Whether to set it: the stand-up jobs are idempotent and time-gated, so the exposure is wasted database work rather than corrupted data. The two cleanup jobs do delete records, so on an internet-reachable instance it is worth the two minutes. While unset, `CRON_ROUTES_UNAUTHENTICATED` reports the fact rather than leaving it implicit.

## Notifications

Thirteen notification types, `N1` through `N13`, all routed through the existing notification service and its deduplication mechanism, each keyed by a `variantKey` so a retry or a second tick cannot double-send.

| Code | Trigger |
|---|---|
| `N1` | Pre-stand-up reminder to every expected attendee |
| `N2` | Stand-up became `Ready` |
| `N3` | Off by default |
| `N4` | Each member's own commitment summary after completion |
| `N5` | Facilitator, admin and stakeholder digest after completion |
| `N6` | A member's stand-up completed with no work allocated to them |
| `N7` | An override was issued, and chronic under-allocation escalation |
| `N8` | Consecutive missed stand-ups (second and third) |
| `N9` | Carry-forward item escalated or turned chronic |
| `N10` | A calendar change affected the stand-up schedule — one consolidated notice |
| `N11` | A status change the project manager made on somebody else's behalf |
| `N12` | Sprint health: projected burn exceeds remaining capacity |
| `N13` | A member self-selected a task onto their own day |

Per-project switches live in `ProjectStandupSettings.notificationSwitches`. All default on except `N3`; a project that has never opened the stand-up settings gets that same default.

## Degradation contract

Release one deliberately ships without several specified capabilities. Each one announces itself rather than looking like working software that quietly does nothing.

| Code | Severity | Stands in for |
|---|---|---|
| `SCHEDULER_STALE` | warning | Jobs have not run recently |
| `HOLIDAY_COVERAGE_GAP` | warning | Sprint extends past loaded holiday data |
| `TIME_LOGGING_MANUAL` | info | Project has no real logged time; PM enters `standup_manual` rows |
| `LEAVE_DATA_MANUAL` | info | No leave module; leave is entered by hand |
| `LIVE_UPDATES_DEGRADED` | info | Presence avatars descoped; 5-second polling plus `STALE_STANDUP` instead |
| `CROSS_PROJECT_LOAD_UNAVAILABLE` | info | Single-project capacity only |
| `COMPLETION_INTERRUPTED` | blocking | The saga stopped mid-run; resume action offered |
| `CRON_ROUTES_UNAUTHENTICATED` | info | `CRON_SECRET` is unset |

`getActiveDegradations(scope)` resolves them per organisation, project, sprint and date range. Coverage is only answerable against a range — "is the calendar complete?" has no meaning without saying complete *through when* — so callers with no range simply do not get that notice.

The full descope register, with what replaced each item:

| Descoped | Replaced by |
|---|---|
| Single MongoDB transaction at completion | Resumable saga with a `completionState` checkpoint |
| Full internationalisation | Centralised `strings.ts`, translation-ready |
| Metrics and alerting | Structured job logs |
| Presence avatars | 5-second polling and optimistic-concurrency 409s |
| Denormalised `standupBoardView` | Live indexed aggregates |
| Millisecond performance budgets | Structural guarantees: no N+1, indexes from day one, pool pagination at 50, capacity-board virtualisation past 25 members |
| Leave-module integration | Manual leave entry on Capacity & Members |
| Suggest-fill allocation | Manual allocation |
| Cross-project capacity load | Single-project capacity |
| Holiday data beyond loaded years | Coverage warning at generation and on the schedule hub |

## Permissions

Nineteen stand-up permissions plus the organisation-scoped `holiday:manage`:

`standup:configure`, `standup:view`, `standup:generate`, `standup:run`, `standup:run_own`, `standup:complete`, `standup:reopen`, `standup:allocate`, `standup:allocate_own`, `standup:override`, `standup:revise_estimate`, `standup:carry_forward_note`, `standup:blocker_raise`, `standup:view_debt`, `standup:view_own_debt`, `standup:write_off_debt`, `standup:view_analytics`, `standup:planning_waiver`.

| Role | Stand-up permissions |
|---|---|
| Super Admin | all |
| Admin | all stand-up permissions, plus `holiday:manage` |
| Human Resource | `view`, plus `holiday:manage` |
| Project Manager (org and project) | everything except `holiday:manage` and `planning_waiver` |
| Project Member / QA Lead / Tester | `view`, `allocate_own`, `run_own`, `blocker_raise`, `view_own_debt`, `view_analytics` |
| Viewer / Project Viewer | `view`, `view_analytics` |
| Team Member (org role) | **none by design** |
| Client / Project Client | none |

**Why the org Team Member role holds nothing:** a grant in the organisation table is organisation-wide — `hasPermission` returns true for a project-scoped permission as soon as the org role holds it, without consulting the project. Listing `standup:view` there would let every team member in the organisation read every stand-up in it, including capacity gaps and estimate debt for projects they are not on. A member of a project resolves to `PROJECT_MEMBER`, which carries the same capability scoped to that project.

**Two-tier own-row permissions.** `standup:allocate_own` and `standup:run_own` are checked at the route wrapper, with the broader `standup:allocate`/`standup:run` checked separately inside the handler to decide whether the caller may act on *someone else's* row. On `PATCH .../yesterday` the own-row path is restricted to `status` and `loggedMinutes`; `note` stays project-manager-only, matching how the module gives note-taking to the PM throughout.

`RUN-26` — a member may edit their own row while the stand-up is `Ready`, and is locked out the moment it moves to `In_Progress` — is implemented once, in `own-row.ts`.

Roles are project-locked and cannot be repaired from Settings, so a role missing a stand-up permission is a defect shipped to every install. `src/lib/permissions/__tests__/standup-role-matrix.test.ts` guards this, deriving "can this role be given work in a sprint?" from the task permissions rather than a hand-maintained list, so a role added later is caught without anyone remembering to extend it.

## API surface

Route placement follows **whether the resource has its own id**, not who owns it. A project singleton nests under `projects/[id]/`; an entity with its own ObjectId sits at the top level and knows its own parent. The test: if you deleted the parent id from the path, could the server still find the record? If yes, it belongs at the top level. Organisation-scoped routes use a singular `organization/` segment and carry **no** org id — the session resolves the tenant server-side, and an id in the path would be decorative at best and an authorisation bypass at worst.

Every mutating route requires the `X-Standup-Version` header and answers `STALE_STANDUP` on a mismatch.

| Route | Methods | Permission |
|---|---|---|
| `projects/[id]/standup-settings` | GET, PUT | `view` / `configure` |
| `projects/[id]/standup-settings/points-migration` | POST, PUT | `view` / `configure` |
| `sprints/[id]/standups` | GET | `view` |
| `sprints/[id]/standups/generate` | POST | `generate` |
| `standups/[id]` | GET | `view` |
| `standups/[id]/start` | POST | `run` |
| `standups/[id]/attendance` | POST, PATCH | `run` / `allocate` |
| `standups/[id]/allocations` | GET, POST | `view` / `allocate`, `allocate_own` |
| `standups/[id]/allocations/[allocationId]` | PATCH, DELETE | `allocate`, `allocate_own` |
| `standups/[id]/yesterday` | GET, PATCH | `view` / `run`, `run_own` |
| `standups/[id]/variance` | GET, POST | `view` / `complete` |
| `standups/[id]/variance/[allocationId]` | POST | `revise_estimate` |
| `standups/[id]/carry-forward` | GET, POST | `view` / `complete` |
| `standups/[id]/blockers` | GET, POST | `view` / `blocker_raise` |
| `standups/[id]/blockers/[blockerId]` | PATCH | `blocker_raise` |
| `standups/[id]/debt` | GET, POST | `view_debt`, `view_own_debt` / `write_off_debt` |
| `standups/[id]/overrides` | POST | `override` |
| `standups/[id]/checks` | GET | `view` |
| `standups/[id]/complete` | POST | `complete` |
| `standups/[id]/backfill` | POST | `complete` |
| `standups/[id]/reopen` | POST | `reopen` |
| `standups/[id]/sprint-close` | GET | `view` |
| `standups/[id]/sprint-close/tasks/[taskId]` | PATCH | `allocate` |
| `standups/[id]/summary` | GET | `view` |
| `standups/[id]/summary/export` | GET | `view` |
| `my/standup` | GET | session |
| `my/standup/candidates` | GET | session |
| `organization/standup-oversight` | GET | `view_analytics` |
| `standup/health` | GET | `view` |
| `cron/standup/[job]` | GET | `CRON_SECRET` if set |

## Error catalogue

Codes are part of the API contract — the UI switches on them to decide whether to show a jump link, a retry or a blocking dialog — so they are never renamed or invented at a call site. `StandupError` is thrown and converted to the response envelope by `toErrorResponse`.

| Code | HTTP | Meaning |
|---|---|---|
| `PLANNING_GATE_NOT_PASSED` | 409 | Sprint planning is not complete |
| `STANDUP_NOT_STARTABLE` | 409 | Too early, wrong status, or another stand-up is in progress |
| `STANDUP_ALREADY_COMPLETED` | 409 | Duplicate completion; the second request changes nothing |
| `COMPLETION_INTERRUPTED` | 409 | A previous attempt did not finish; resume required |
| `STALE_STANDUP` | 409 | Optimistic-concurrency mismatch; details carry current server state |
| `IMMUTABLE_COMPLETED_STANDUP` | 409 | A change would damage a completed stand-up |
| `COMPLETION_CHECKS_FAILED` | 422 | Details list every failing check |
| `TASK_NOT_ESTIMATED` | 422 | Allocation refused — the task has no estimate |
| `INVALID_JUSTIFICATION` | 422 | Too short, or in the low-value list |
| `NOTE_UNCHANGED` | 422 | Carry-forward note identical to the previous one |
| `CAPACITY_EXCEEDED` | 422 | Only when a project blocks over-allocation outright |
| `NOT_A_WORKING_DAY` | 422 | |
| `ESTIMATE_IMMUTABLE` | 422 | Original estimate change attempted after planning |
| `VALIDATION_FAILED` | 422 | Ordinary input validation |
| `OVERRIDE_NOT_PERMITTED` | 403 | That check is a hard block |
| `REOPEN_WINDOW_EXPIRED` | 403 | |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | |
| `EXTERNAL_SERVICE_ERROR` | 502 | A third-party integration failed |
| `INTERNAL_ERROR` | 500 | |

`VALIDATION_FAILED`, `NOT_FOUND`, `EXTERNAL_SERVICE_ERROR` and `FORBIDDEN` are additions beyond the specification's catalogue. Reusing a domain code for ordinary validation produces a misleading contract — a malformed CSV date answering `NOT_A_WORKING_DAY` tells the client something untrue — so generic codes exist rather than overloading specific ones.

## Screens

| Route | Screen |
|---|---|
| `/projects/[id]/standups` | Schedule hub — sprint health, today's hero row, the day timeline |
| `/projects/[id]/sprints/[sprintId]/standups/[standupId]` | The run screen |
| `/projects/[id]/sprints/[sprintId]/standups/[standupId]/summary` | Completed stand-up summary |
| `/my/standup` | Member view; redirects to today's stand-up, or renders cross-project oversight for an org admin with no project |
| `/my/standup/[standupId]` | One member's own row |
| `/sprints/[id]/planning` | Planning workspace: scope, poker, checklist |
| Project detail → Stand-ups tab | Configuration: stand-up settings, working calendar, capacity & members |
| Organisation settings → Holidays | Holiday sets, import, revocation |

### The run screen

`StandupRunScreen.tsx` is "the screen the module lives or dies on". Seven panels: attendance, yesterday's review, variance, carry-forward, the allocation pool and capacity board, blockers, and the completion gate. On a `day_one` stand-up the pool/capacity split becomes the **top** panel, and panels 2, 3 and 4 are absent because there is no yesterday.

Two behaviours carry most of the risk:

- **Optimistic edits with visible rollback (`RUN-25`).** A row's hours change on screen before the server answers, because a meeting cannot wait for a round trip per stepper click. When the server refuses, the row goes back *and a toast says so*. A silent revert is strictly worse than no optimism: the PM believes the change stuck and finds out at completion.
- **The version is a ref, not state (`RUN-23`).** The concurrency token is read at call time from a `useRef`, not captured by each callback's closure at render time. Held in state, two edits fired in quick succession both sent the first edit's version, and the second was refused as `STALE_STANDUP` though the client had done nothing wrong — which surfaces exactly when a PM is working fast and is least able to diagnose it. A concurrency token is not display data.

The `/my/standup` screen is a thin wrapper over the same `loadAllocationBoard` read and the same `RunScreenData` shape, filtered to one member's row — not a second run-screen implementation. Its five fetches are parallel and read-tolerant: a failure in any secondary endpoint renders that section's own error state rather than blanking the screen. A member sitting on more than one project's sprint team sees every other candidate for today as an informational banner, rather than having them silently discarded.

Content rules applied to the member view without exception: every section header carries a live number ("Yesterday — 2 of 3 done, 6.5h logged", never "Yesterday"); one computed headline sentence per state, assembled from that member's real numbers; and every empty state states a fact, never an absence ("Nothing blocked. Two tasks carried from yesterday", never "No blockers").

### Primitives and accessibility

`Drawer`, `ModalOverlay`, `CapacityMeter`, `HourStepper` and `QuickAddCombobox` were built with a full keyboard path from the start rather than retrofitted onto drag-and-drop. `ModalOverlay` is the centred-dialog sibling of the right-docked `Drawer`, reusing its proven backdrop, Tab-cycling focus trap and Escape handling.

`keyboard-shortcuts.ts` is a pure matcher for the specification's key table, including the `g`-then-`s` chord, with `useStandupShortcuts` wiring it to the DOM. Shortcut handlers reuse each row's own existing action handlers via a `data-row-id` attribute, never a parallel mutation path.

## Code map

Everything lives under `src/lib/standup/` (domain and services), `src/components/standup/` (UI) and `src/models/` (schemas).

**Platform spine**

| Module | Purpose |
|---|---|
| `minutes.ts` | Integer-minute arithmetic |
| `saga.ts` | Resumable, ordered sequence of writes |
| `errors.ts` | The error catalogue |
| `audit.ts` | Audit recording |
| `degradation.ts` | The degrade-loudly contract |
| `strings.ts` | User-facing string catalogue |
| `route-helpers.ts` | Shared route plumbing, permission wrappers, org isolation |
| `version-header.ts` | The header every mutating request carries |
| `timezone.ts` | Dual-timezone rendering |
| `jobs/*` | Registry, runner, lock, heartbeat, scheduler, and the six jobs |

**Calendar, capacity, planning**

| Module | Purpose |
|---|---|
| `working-day.ts` / `calendar-service.ts` | Working-day resolution |
| `calendar-dates.ts` | Pure date helpers |
| `capacity.ts` / `capacity-context.ts` | Capacity computation and its single loader |
| `ceremonies.ts` | Ceremony deductions |
| `calendar-impact.ts` / `preview-impact.ts` | Impact analysis behind confirmation dialogs |
| `holiday-admin.ts` / `holiday-import.ts` / `holiday-api-sync.ts` | Holiday administration |
| `organization-calendar.ts` | Org default holiday subscription |
| `planning-gate.ts` / `planning-checklist.ts` / `planning-service.ts` | The gate, the checklist, the writer |
| `poker.ts` | Planning poker |
| `estimates.ts` | Estimate rules and floors |
| `points-migration.ts` | Story-point conversion changes |
| `sprint-states.ts` | Sprint state machine |

**Schedule and lifecycle**

| Module | Purpose |
|---|---|
| `generation.ts` | Idempotent stand-up generation |
| `day-numbering.ts` | Working-day ordinal and shape |
| `lifecycle.ts` | The eight-state transition machine |
| `reconcile-rules.ts` / `reconcile.ts` | Calendar-change planner and executor |
| `schedule.ts` | The schedule hub read model |
| `snapshot.ts` | The pre-stand-up snapshot |
| `start-service.ts` / `reopen-service.ts` / `backfill-service.ts` | Start, reopen, backfill |

**The meeting**

| Module | Purpose |
|---|---|
| `allocation.ts` / `allocation-service.ts` | Allocation rules and the single writer |
| `prefill.ts` | Auto pre-fill planning |
| `assignment-service.ts` | Sprint-work assignment during planning |
| `attendance-service.ts` | Attendance and detachment |
| `yesterday.ts` / `yesterday-service.ts` | Panel 2's four buckets |
| `variance.ts` / `variance-service.ts` | The classifier and its writer |
| `revision-service.ts` | The two answers a stand-up demands |
| `debt.ts` / `debt-position.ts` / `debt-service.ts` / `debt-summary.ts` | Debt arithmetic, position, PM actions, read model |
| `time-logs.ts` | Logged time, indexed for variance |
| `carry-forward.ts` / `carry-forward-service.ts` | Register rules and writer |
| `blocker.ts` / `blocker-service.ts` | Blocker fields and lifecycle |
| `override.ts` / `override-service.ts` | Reason codes, justification rule, issuance |
| `completion-checks.ts` / `completion-context.ts` / `completion-saga.ts` / `check-extras.ts` | The gate and its saga |
| `sprint-close.ts` / `sprint-close-service.ts` | Final-day readiness |
| `sprint-health.ts` | Projected burn vs. capacity |
| `summary.ts` / `summary-service.ts` | Summary assembly and read path |
| `notifications.ts` | `N1`–`N13` |
| `task-ownership.ts` | Which allocation carries a task's variance |
| `own-row.ts` | `RUN-26`, in one place |
| `my-standup-candidates.ts` | The member-view redirect target and "also today" banner |
| `admin-oversight.ts` | Cross-project oversight |
| `keyboard-shortcuts.ts` | The pure key matcher |

`debt-position.ts` deliberately has no capacity-module import, keeping the dependency graph acyclic against `capacity-context.ts`, which needs it.

## Configuration

`ProjectStandupSettings`, per project:

| Field | Default | Notes |
|---|---|---|
| `enabled` | `false` | The module is opt-in |
| `standupLocalTime` | `09:15` | Project-local |
| `durationMinutes` | `15` | 5–60 |
| `readyLeadMinutes` | `15` | 5–120 |
| `reminderLeadMinutes` | `60` | 0–1440 |
| `meetingUrl` | — | Shown on the hero row and reminder |
| `defaultFacilitator` | — | |
| `overrunPolicy` | `absorb` | `absorb` reduces tomorrow's capacity by outstanding debt; `reduce` does not |
| `underToleranceMinutes` | `15` | 0–120 |
| `overToleranceMinutes` | `15` | 0–120 |
| `carryForwardNoteThreshold` | `3` | Stand-ups before a note is required |
| `carryForwardEscalationThreshold` | `5` | Stand-ups before escalation |
| `reopenWindowHours` | `24` | 0–120 |
| `backfillWindowWorkingDays` | `2` | 0–5 |
| `allowSelfSelect` | `false` | Members pulling their own work |
| `allowMemberPreEdit` | `true` | Own-row editing while `Ready` |
| `carryDebtBetweenSprints` | `false` | |
| `crossSprintCarryForward` | `false` | |
| `blockedTasksConsumeCapacity` | `false` | |
| `requireOverAllocationAck` | `true` | |
| `ceremoniesConsumeCapacity` | `true` | |
| `pointsToHours` | `4` | 0.5–40 |
| `notificationSwitches` | all on except `N3` | |

Environment variables:

| Variable | Effect |
|---|---|
| `KANVARO_INTERNAL_SCHEDULER` | `false` disables the in-process ticker. Unset means enabled. |
| `CRON_SECRET` | Set, cron routes require `Authorization: Bearer`. Unset, they behave as before. |

No stand-up-specific variable is required for a standard self-hosted install.

## Testing

186 test suites, **2,768 passing and 5 skipped**, verified by running `npx jest src/lib/standup src/components/standup` against this branch.

```bash
npm test                  # the whole suite
npm run type-check        # tsc --noEmit
npm run lint
npx jest src/lib/standup  # the module's domain tests only
```

Conventions:

- **Pure rules are unit-tested; services get database integration tests** against a real MongoDB via `__tests__/helpers/mongo.ts`. Node is the default test environment; component tests opt into `jsdom` per file.
- **The worked example is the spine.** `fixtures/worked-example.ts` and `helpers/worked-example-seed.ts` reproduce the specification's own §12.3 numbers end to end. If the variance engine drifts, that test fails first.
- **The reconciler is table-driven.** All nine triggers against all eight statuses were proven as a matrix before any individual case was trusted.
- **Failure injection before happy path.** The completion saga's interrupted-run test was written first, by design, and asserts `COMPLETION_INTERRUPTED` surfaces with a working resume action.
- **Boundary tests are deliberately brittle.** The variance tolerance cases fail if any `<=` is loosened to `<`.
- **Named regression tests for named risks.** The double-deducted stand-up duration, single ledger accrual on a shared task, zero ledger entries for a retroactively absent member, and an unacknowledged `CC-1` blocking a backfill each have a test named for the defect it prevents.
- **Permissions are tested against the payload, not the UI.** The role matrix test derives its subjects from task permissions, so a role added later is covered automatically.

## Operations

```bash
npm run seed:holidays                      # bulk-load holiday data (idempotent on set+date+name)
npm run standup:rebuild-debt-summaries     # rebuild MemberSprintDebtSummary from the ledger
node scripts/seed-standup-full-demo.js     # full demo dataset (idempotent)
```

Rebuilding debt summaries is always safe: the ledger is the source of truth and the summary is discardable. A rebuild from scratch reproduces identical numbers, and that is asserted by a test.

The demo seed scripts use the raw MongoDB driver rather than Mongoose, following the existing seed convention. `seed-standup-full-demo.js` fixes project team membership and role wiring on both `Project.teamMembers`/`projectRoles` and `User.projectRoles` — both sides must agree, because different code paths read each — backfills `StandupSummary` documents for completed stand-ups, and creates a live sprint with a deliberate capacity imbalance so the capacity board is not trivially all-green.

Holiday data for fresh installs lives under `scripts/seed-data/holidays/`.

## What is not built

Stated plainly, because a gap documented is a gap someone can close.

**Specified and absent:**

- **The Stand-up Analytics dashboard (§15.15) does not exist.** There is no route, no component and no aggregation layer. `standup:view_analytics` is granted to several roles and gates only the cross-project oversight endpoint. The pure functions such a dashboard would use — `estimationAccuracy`, `detectChronicUnderAllocation`, `computeDebtPosition` — exist and are tested but have no UI caller. `StandupOversightScreen` (reached from `/my/standup` when an org admin has no project to land on) is the closest thing that ships, and it answers "where do I intervene today" across projects rather than analysing one sprint.
- **The task quick-edit drawer (§15.10) does not exist.** There is no quick-edit surface wrapping the `Drawer` primitive; `Drawer` is used by the capacity board's member drawer and the debt ledger only.
- **`readmodel-refresh`** is a declared job name with no implementation. Harmless today — the runner skips it — but it is a name that promises something.

**Operational:**

- `vercel.json` omits crons for `escalate-carry-forward` and `sprint-health`, so those two do not run on a serverless deployment.
- The `E6` confirmation dialog for a project timezone change is unbuilt. The recompute is correct; nothing forces the PM to confirm it.

**Design questions still open:**

- `hoursAvailableTodayMinutes` on the sprint-close panel is one sprint-wide capacity total applied identically to every open task, rather than something owner-specific. The value renders; the computation behind it is a known design question, not an answered one.
- `override_followup` and `cross_sprint` carry-forward sourcing is supported by the model and the resolution rules but has no automatic writer.

**Verification:**

- The consolidated cross-screen accessibility and responsive sweep (light and dark, four breakpoints, keyboard-only, per screen) was executed piecemeal across individual plans rather than as one final pass. There are no visual-regression tests, so styling changes are verified by hand.

**Stale comments to distrust:**

- `StandupRunScreen.tsx`'s own header docblock still says Panel 6 (blockers) "renders as a stub naming the phase that owns it". It does not — `BlockerPanel` is rendered with real data and the raise and resolve paths are wired. The comment predates that work.
