---
slug: "reference/api-route-structure"
title: "API Route Structure"
summary: "Where a new route handler goes under src/app/api, and the rule that decides between a nested and a top-level path."
visibility: "public"
audiences: ["admin", "self_host_admin"]
category: "reference"
order: 81
updated: "2026-08-17"
---

# API Route Structure

Where a new route handler goes under `src/app/api/`. This describes what the code
actually does today, derived from the existing routes.

> Not to be confused with `rest-api-design.md`, which describes an aspirational
> versioned API on a separate host (`api.kanvaro.com/v1`). That is not what ships;
> routes are Next.js handlers served from the app itself at `/api/...`.

## The rule

Placement follows **whether the resource has its own id**, not who owns it.

| Shape | When | Examples |
|---|---|---|
| `projects/[id]/<thing>` | Exactly one per project, or a collection meaningless without the project. No independent identity. | `projects/[id]/team`, `projects/[id]/versions`, `projects/[id]/expenses`, `projects/[id]/working-calendar`, `projects/[id]/standup-settings` |
| `<things>/[id]` | The resource has its own ObjectId and is addressed directly. It knows its own parent. | `sprints/[id]`, `tasks/[id]`, `stories/[id]`, `epics/[id]` |

The common confusion is that sprints "belong to" a project and yet live at the top
level. That is not an inconsistency. A sprint has its own id, so `sprints/abc123`
is sufficient to identify it — requiring the project id in the path would add a
component the server has to either ignore or re-validate, which is a second way to
get authorisation wrong. Whereas `projects/[id]/team` genuinely cannot be resolved
without the project.

A useful test: **if you deleted the parent id from the path, could the server still
find the record?** If yes, it belongs at the top level.

## Organisation-scoped routes

Singular `organization/`, and **no org id in the path**:

```
organization/settings
organization/holiday-sets
organization/holiday-sets/[setId]/import
```

The session resolves the caller's organisation server-side. An id in the path would
be decorative at best and an authorisation bypass at worst. Note that external
specs often assume a multi-tenant `/organizations/:orgId/...` shape — do not copy it
in; Kanvaro resolves the tenant from the session.

## Naming

- **Plural collections, singular for a singleton scope.** `projects/`, `sprints/`,
  `tasks/` are collections. `organization/` is the caller's single organisation.
- **Prefer a specific name over a generic one when a generic one is taken.**
  `projects/[id]/working-calendar` rather than `calendar`, because `/api/calendar`
  already serves the task and sprint event feed — a different concern entirely.
- Kebab-case for multi-word segments (`working-calendar`, `holiday-sets`,
  `member-capacity`), matching `time-tracking`, `test-cases`, `sprint-events`.

## Worked example: the stand-up module

The module spans both shapes, which is why it can look inconsistent mid-build.

Configuration — one per project, nested:

```
projects/[id]/working-calendar
projects/[id]/working-calendar/overrides/[overrideId]
projects/[id]/working-calendar/working-days
projects/[id]/working-calendar/preview-impact
projects/[id]/standup-settings
projects/[id]/member-capacity
```

Instances — own ids, flat (Phase 3 onward):

```
sprints/[id]/standups        the schedule for a sprint
standups/[id]                a single stand-up
standups/[id]/allocations
allocations/[id]
```

Both halves follow the same rule; they only differ because a working calendar is a
project singleton and a stand-up is an entity.
