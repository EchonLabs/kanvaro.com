---
slug: "operations/background-jobs"
title: "Background Jobs and the Stand-up Scheduler"
summary: "How Kanvaro runs scheduled stand-up work, why self-hosted installs need no configuration, and the two optional environment variables for serverless deployments and cron authentication."
visibility: "internal"
audiences: ["admin", "self_host_admin"]
category: "operations"
order: 30
updated: "2026-08-24"
---

# Background Jobs and the Stand-up Scheduler

The stand-up module depends on work that happens without anyone clicking anything: promoting a stand-up to Ready shortly before it starts, sending reminders, marking an overdue stand-up as Missed, and repairing a sprint whose stand-ups went missing.

**If you run Kanvaro with Docker, there is nothing to configure.** This page exists for the two cases where there is: serverless deployments, and locking down the job URLs.

## What runs, and when

| Job | Frequency | What it does |
| --- | --- | --- |
| `promote-to-ready` | every 5 minutes | Moves a Scheduled stand-up to Ready at its lead time and builds its snapshot |
| `send-reminders` | every 5 minutes | Sends the stand-up reminder at the configured lead time |
| `mark-missed` | hourly | Moves an overdue Scheduled or Ready stand-up to Missed and rolls its obligations forward |
| `generation-audit` | daily | Finds active sprints with missing stand-ups and repairs them |
| `escalate-carry-forward` | daily | Escalates carry-forward items that have aged past their thresholds |
| `sprint-health` | on completion, and daily | Recomputes projected burn and warns when scope exceeds remaining capacity |
| `readmodel-refresh` | on write, nightly rebuild | Keeps the debt summaries current |

Every job is safe to run twice and safe to run concurrently. Each takes a short-lived lock in MongoDB, so two application instances ticking at the same moment produce one execution, not two. Each job also resolves every project's *local* time itself — there is no single global midnight, so a project in Colombo and a project in Berlin both get their stand-ups at the right hour.

## How they are driven

**Self-hosted (the default).** The application process runs an internal ticker that wakes every 60 seconds and runs any job that is due. It starts automatically when the server boots. Nothing to install, no extra container, no Redis required.

You can confirm it started by looking at the container logs for a line like:

```json
{"event":"standup.scheduler.started","at":"2026-08-24T05:29:26.612Z","intervalMs":60000,"jobs":7}
```

Each job run then writes its own line, which is how you check what the system has been doing:

```json
{"event":"standup.job.run","at":"...","job":"mark-missed","ok":true,"durationMs":412,"scannedProjects":12,"created":0,"skipped":9,"repaired":1,"errorCount":0}
```

**Serverless (e.g. Vercel).** There is no long-lived process for a ticker to live in, so the platform's scheduler calls the jobs over HTTP instead. Set:

```bash
KANVARO_INTERNAL_SCHEDULER=false
```

The schedules themselves are declared in `vercel.json`. Leave this variable unset anywhere else — unset means the internal ticker runs, which is what you want.

## "Stand-ups are not being promoted automatically"

If you see this notice in Kanvaro, the jobs have not run recently. Work through these in order:

1. **Check the logs for `standup.scheduler.started`.** If it is absent, the ticker never began. On a serverless deployment that is expected — confirm your platform's cron is calling `/api/cron/standup/*` instead.
2. **Check whether `KANVARO_INTERNAL_SCHEDULER` is set to `false`** on a deployment that has no external cron. That combination means nothing is driving the jobs.
3. **Check for `standup.job.run` lines with `"ok":false`.** The `errors` array on those lines names the projects that failed and why.
4. **Restart the application.** The ticker starts with the process; a crash during boot can leave the server serving requests without it.

The notice clears on its own once a job runs successfully.

## Locking down the job URLs

The `/api/cron/*` endpoints can be called by anyone who knows the address unless you set a shared secret:

```bash
CRON_SECRET=<a long random string>
```

With it set, those endpoints require a matching `Authorization: Bearer <value>` header and answer `401` otherwise. With it unset, they behave exactly as they always have — which is why upgrading Kanvaro never requires you to change your environment.

On Vercel, setting `CRON_SECRET` is the whole configuration: the platform attaches that header to cron invocations automatically once the variable exists.

**Should you set it?** The stand-up jobs are idempotent and time-gated — calling `promote-to-ready` a thousand times promotes nothing that was not already due, so the exposure is wasted database work rather than corrupted data. Two of the other jobs (`timer-cleanup`, `notification-cleanup`) do delete records, so if your instance is reachable from the public internet, setting the secret is worth the two minutes.

## Related

- [Production Deployment Guide](/docs/internal/operations/deployment)
- [Monitoring](/docs/internal/operations/monitoring)
