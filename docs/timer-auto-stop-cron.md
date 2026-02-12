---
slug: "operations/timer-auto-stop-cron"
title: "Timer Auto-Stop Cron Job Setup"
summary: "Configure the cron endpoint that automatically stops timers exceeding their allowed session limit."
visibility: "internal"
audiences: ["admin", "self_host_admin"]
category: "operations"
order: 30
updated: "2026-02-02"
---

# Timer Auto-Stop Cron Job Setup

## Overview

The timer cleanup cron job automatically stops timers that exceed their `maxSessionHours` limit when `allowOvertime` is set to `false`. This ensures timers don't run indefinitely when users are offline.

## Endpoint

**URL:** `/api/cron/timer-cleanup`  
**Method:** `GET`  
**Frequency:** Every 5-15 minutes (recommended: 10 minutes)
## How It Works

1. Fetches all active timers from the database
2. For each timer, checks if:
   - `allowOvertime` is `false`
   - `maxSessionHours` is configured
   - Current duration exceeds the limit
3. Auto-stops expired timers by:
   - Creating a time entry with duration capped at `maxSessionHours`
   - Calculating exact end time based on the limit
   - Applying rounding rules if configured
   - Sending notifications to users
   - Deleting the active timer record

## Setup Instructions

### Option 1: Vercel Cron (Recommended for Vercel Deployments)

1. Create or update `vercel.json` in your project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/timer-cleanup",
       "schedule": "*/10 * * * *"
    }
  ]
}
```

2. Deploy to Vercel - the cron job will run automatically every 10 minutes
### Option 2: External Cron Service (e.g., cron-job.org, EasyCron)

1. Set up an environment variable for security:
   ```
   CRON_SECRET=your-random-secret-key
   ```

2. Configure your cron service to call:
   ```
   GET https://your-domain.com/api/cron/timer-cleanup
   Header: Authorization: Bearer your-random-secret-key
   ```

3. Set frequency to every 10 minutes: `*/10 * * * *`

### Option 3: AWS EventBridge (for AWS deployments)

1. Create an EventBridge rule with schedule: `rate(10 minutes)`
2. Target: API Destination pointing to your endpoint
3. Add authorization header if using `CRON_SECRET`

### Option 4: GitHub Actions (for testing/development)

Create `.github/workflows/timer-cleanup.yml`:

```yaml
name: Timer Cleanup
on:
  schedule:
    - cron: '*/10 * * * *'  # Every 10 minutes
  workflow_dispatch:  # Allow manual trigger

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Call cleanup endpoint
        run: |
          curl -X GET "https://your-domain.com/api/cron/timer-cleanup" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

## Security

The endpoint supports optional authentication via the `CRON_SECRET` environment variable:

```bash
# .env.local or your hosting platform
CRON_SECRET=your-random-secret-key-here
```

If `CRON_SECRET` is set, requests must include:
```
Authorization: Bearer your-random-secret-key-here
```

## Testing

### Manual Test

Call the endpoint directly (with auth if configured):

```bash
curl -X GET "http://localhost:3000/api/cron/timer-cleanup" \
  -H "Authorization: Bearer your-secret"
```

### Expected Response

```json
{
  "success": true,
  "message": "Timer cleanup completed. Stopped: 2, Skipped: 5, Errors: 0",
  "summary": {
    "totalChecked": 7,
    "stopped": 2,
    "skipped": 5,
    "errors": 0
  },
  "results": [
    {
      "timerId": "60a7b8c9d0e1f2a3b4c5d6e7",
      "user": "John Doe",
      "project": "Project Alpha",
      "duration": 240,
      "status": "stopped"
    }
  ]
}
```

## Monitoring

Check your logs for:
- Number of timers stopped per run
- Any errors during timer cleanup
- Performance metrics

Example log output:
```
Timer cleanup completed. Stopped: 3, Skipped: 10, Errors: 0
```

## Troubleshooting

### Timers Not Stopping

1. Verify cron job is running (check logs/monitoring)
2. Check `allowOvertime` setting: must be `false`
3. Check `maxSessionHours` setting: must be configured
4. Verify timer duration exceeds the limit
5. Check database connection

### Authentication Errors

1. Verify `CRON_SECRET` matches in both env and cron config
2. Check authorization header format: `Bearer <secret>`
3. Remove `CRON_SECRET` to disable auth during testing

### Performance Issues

If you have many active timers (>1000):
1. Consider running cleanup more frequently
2. Add pagination to the timer query
3. Process timers in batches
4. Monitor database performance

## Related Files

- **Cron endpoint:** `src/app/api/cron/timer-cleanup/route.ts`
- **ActiveTimer model:** `src/models/ActiveTimer.ts`
- **Timer route:** `src/app/api/time-tracking/timer/route.ts`
- **TimeEntry model:** `src/models/TimeEntry.ts`

## Environment Variables

```bash
# Optional - for securing the cron endpoint
CRON_SECRET=your-random-secret-key

# Required - database connection
MONGODB_URI=your-mongodb-connection-string
```

## Cron Schedule Reference

```
*/10 * * * *   # Every 10 minutes
*/5 * * * *    # Every 5 minutes
*/15 * * * *   # Every 15 minutes
0 * * * *      # Every hour
```

## Notes

- Stopped timers will have their duration capped at `maxSessionHours`
- Users receive notifications when timers are auto-stopped
- Time entries are created with `status: 'completed'` or `status: 'pending'` (if approval required)
- The exact end time is calculated as: `startTime + maxSessionHours + totalPausedDuration`
- This fixes the issue where timers would run indefinitely when users were offline
