# Kanavaro — AI Standup Dashboard
**Feature Requirement + Implementation Plan · v2.0 · Internal**
*Original: voice note briefing, team chat discussion · Updated: full technical design*

---

## 1. Overview

The AI Standup Dashboard is a **live, interactive, project-scoped dashboard inside Kanavaro** that gives the PM a real-time view of team commitments versus actual task delivery. It surfaces gaps, blockers, and sprint risk automatically — driven by task board activity, time logs, and PM-entered standup notes.

**This is not a Zoom integration. This is not a meeting recorder.** Everything runs through Kanavaro's existing project management module — card movements, time entries, status changes, and activity logs — as the primary data source.

---

## 2. Requirement Evolution

| Previous Assumption | Current Requirement |
|---|---|
| Zoom API for meeting recordings | No Zoom integration — task board driven |
| Gemini audio transcription (Sinhala + English) | Not required |
| Audio-based speaker identification | Not applicable |
| Meeting-driven capture | Task board + time log driven capture |
| Sprint-scoped standup | **Project-scoped standup** — all project members |

---

## 3. Core Concepts

### 3.1 Working Circle
A "day" in the system is defined as **9:00 AM → 8:00 AM next morning**.

```
Monday 9:00 AM ─────────────────────── Tuesday 8:00 AM
       ↑                                       ↑
  Standup: PM assigns                   Scheduled analysis job fires
  daily commitments                     (before next standup)
```

### 3.2 Project Scope
- One standup session per project per day
- All members currently assigned to that project are automatically tracked
- PM handles one project at a time — navigates project to project
- Sessions are independent per project — no data bleed between projects

### 3.3 Three Phases Per Day

**Phase 1 — Pre-Standup Briefing (Auto-generated before 9 AM)**
- System collects all data from the previous working circle (9AM → 8AM)
- Scores every committed task: done / partial / no-movement / zero-time
- Surfaces open PM notes from previous sessions still unresolved
- Sends data to Groq LLM → generates analysis report
- Dashboard is ready before the PM walks in

**Phase 2 — During Standup (PM + team)**
- PM reviews the pre-generated analysis with the team
- PM adds comments on flagged/blocked items
- PM assigns today's task commitments per person (from sprint task board)

**Phase 3 — Carry-Forward Loop**
- Any task not marked `done` by 8 AM carries into the next session automatically
- PM notes persist per task until the PM marks them resolved or the task is done
- Age counter tracks how many days a task has been open

---

## 4. Access Control

### Role-Based Visibility

| Role | Dashboard Access | Data Scope |
|---|---|---|
| `admin` | Full view | All projects in the organization |
| `human_resource` | Full view | All projects in the organization |
| `project_manager` | Full view | Assigned projects only |
| `account_manager` | Full view | Assigned projects only |
| `team_member` | Own data only | Assigned projects only |
| `qa_engineer` | Own data only | Assigned projects only |
| `tester` | Own data only | Assigned projects only |
| `client` | No access | — |
| `viewer` | No access | — |

### Full View includes
- All team members' commitments and outcomes
- AI analysis: risk score, nudges, trends, priority suggestions
- PM notes (read + write)
- Historical trend panel

### Own Data Only includes
- Their own commitments for the day
- Their own task outcomes and time logged
- PM notes addressed to them (read-only)
- No risk score, no other members' data, no AI nudges

### Two-Step API Guard (applied on every standup route)
```
Step 1: Is this user a member of the requested project? → 403 if not
Step 2: What is their effective role on this project?
  - Check projectRoles first (project-specific role takes precedence)
  - Fall back to org-level role
  - full view roles → return complete data
  - own-data roles → filter to user._id
  - no-access roles → 403
```

---

## 5. Logical Flow (Complete)

```
[Before 9 AM — scheduled job per active project]
  Collect TimeEntry records: user + task + duration within working circle
  Collect ActivityLog: task_status_changed events within working circle
  For each StandupCommitment from yesterday:
    - currentStatus = Task.status (live)
    - timeLogged = sum of TimeEntry.duration for that user + task
    - statusMoved = any ActivityLog entries for that task in the circle
    - fulfilled = (currentStatus === 'done')
    - noMovement = !statusMoved && currentStatus !== 'done'
  Pull open pmNotes from previous sessions (resolved: false, task still open)
  Build Groq payload → call Groq API → store response in StandupSession.analysis
  Dashboard is ready

[9 AM — PM opens standup dashboard]
  Selects a project → sees the pre-generated analysis:
    - Yesterday's results per person (committed vs done)
    - No-movement flags, zero-time flags
    - Open PM notes from previous days (with age counter)
    - Risk score, nudges, priority suggestions from Groq
  Discusses flags with team
  Adds/updates PM comments on issues
  Assigns today's task commitments per person → saved as StandupCommitment records
  Session status → 'active' during standup → 'completed' when PM closes

[9 AM → next 8 AM — working circle]
  Team works normally on task board
  System passively collects time entries and status changes
  No input needed from PM or team

[Carry-forward — any task not done]
  Task stays in the dashboard every day until Task.status === 'done'
  PM note stays attached — PM can update, resolve, or let it carry
  Age counter increments each day
  When task.status === 'done' → commitment marked fulfilled, note archived
```

---

## 6. Data Sources (All Existing Infrastructure)

| Data Needed | Source Model | Key Fields |
|---|---|---|
| Task assignments + status | `Task` | `assignedTo`, `status`, `sprint`, `project` |
| Status change timestamps | `ActivityLog` | `action: 'task_status_changed'`, `entityId`, `createdAt` |
| Time logged per task per user | `TimeEntry` | `user`, `task`, `duration`, `startTime`, `endTime` |
| Project members | `User.projectRoles` + `Project.teamMembers` | `projectRoles[].project`, `role` |
| Active sprint | `Sprint` | `project`, `status: 'active'` |
| Org-level role | `User.role` | role enum |
| Project-level role | `User.projectRoles[].role` | role enum |

---

## 7. New Data Models

### 7.1 `StandupSession`
One per project per day. Created by PM at standup start or auto-created by analysis job.

```typescript
{
  organization: ObjectId,           // ref: Organization
  project: ObjectId,                // ref: Project — PRIMARY scope
  sprint: ObjectId | null,          // ref: Sprint — active sprint at session time (null if no active sprint)
  date: Date,                       // calendar day (midnight boundary — date only, no time)
  workingCircleStart: Date,         // 9:00 AM of this day
  workingCircleEnd: Date,           // 8:00 AM of next day
  status: 'pending' | 'active' | 'completed',
  createdBy: ObjectId,              // ref: User (the PM who opened it)
  members: ObjectId[],              // snapshot of all project members at session time
  briefingSnapshot: {
    generatedAt: Date,
    gaps: [{                        // commitments from yesterday not fulfilled
      userId: ObjectId,
      taskId: ObjectId,
      taskTitle: string,
      statusAtCommitment: string,
      currentStatus: string,
      daysOpen: number,
    }],
    noMovementTasks: [{             // tasks with zero status changes in the circle
      taskId: ObjectId,
      taskTitle: string,
      assignedUserId: ObjectId,
      lastMovedAt: Date | null,
    }],
    zeroTimeTasks: [{               // tasks committed but with no time logged
      taskId: ObjectId,
      taskTitle: string,
      assignedUserId: ObjectId,
    }],
    openNotes: [{                   // PM notes from previous sessions still unresolved
      commitmentId: ObjectId,
      taskId: ObjectId,
      taskTitle: string,
      userId: ObjectId,
      noteContent: string,
      noteCreatedAt: Date,
      daysOpen: number,
    }],
  },
  analysis: {
    riskScore: number,              // 0–100
    riskLevel: 'low' | 'medium' | 'high' | 'critical',
    summary: string,
    nudges: [{
      userId: ObjectId,
      taskId: ObjectId,
      message: string,
    }],
    trends: string[],
    prioritySuggestions: string[],
    generatedAt: Date,
  } | null,
  completedAt: Date | null,
}
```

### 7.2 `StandupCommitment`
One per person per session. Captures what each member commits to, then tracks actual outcome.

```typescript
{
  standupSession: ObjectId,         // ref: StandupSession
  organization: ObjectId,           // ref: Organization
  project: ObjectId,                // ref: Project
  user: ObjectId,                   // ref: User — the team member
  date: Date,                       // same as session date
  tasks: [{
    task: ObjectId,                 // ref: Task
    taskTitle: string,              // snapshot at commitment time
    statusAtCommitment: string,     // snapshot at 9 AM
    statusAtEndOfDay: string | null,// filled by EOD analysis job
    timeLoggedMinutes: number,      // filled by EOD analysis job
    fulfilled: boolean,             // true when status reaches 'done'
    noMovement: boolean,            // true when zero status changes in circle
    zeroTime: boolean,              // true when no time logged
  }],
  pmNote: {
    content: string,                // "Blocked — waiting on client API credentials — target Wed EOD"
    blocker: string | null,
    targetResolution: Date | null,
    resolved: boolean,
    resolvedAt: Date | null,
    createdAt: Date,
    updatedAt: Date,
  } | null,
  carriedFromDate: Date | null,     // if any task in this commitment was open from a previous day
  daysOpen: number,                 // how many consecutive standup days this has been open
}
```

---

## 8. Groq LLM Integration

**Model:** `llama-3.3-70b-versatile` (or `mixtral-8x7b-32768` as fallback)
**Trigger:** EOD analysis job before 9 AM, or manual PM trigger from dashboard

### Payload sent to Groq
```json
{
  "project": { "name": "...", "id": "..." },
  "sprint": { "name": "...", "startDate": "...", "endDate": "...", "daysRemaining": 6, "totalTasks": 24, "doneTasks": 9 },
  "standupDate": "2026-05-27",
  "workingCircle": { "from": "2026-05-26T09:00:00", "to": "2026-05-27T08:00:00" },
  "teamPerformance": [
    {
      "userId": "...",
      "name": "Alice",
      "role": "Frontend Dev",
      "committedCount": 2,
      "fulfilledCount": 1,
      "timeLoggedMinutes": 390,
      "noMovementTasks": [],
      "zeroTimeTasks": [],
      "openTaskTitles": ["Profile Page redesign"],
      "openBlockerNote": null
    }
  ],
  "openPMNotes": [
    { "person": "Charlie", "task": "API Integration", "note": "Waiting on client credentials", "daysOpen": 2 }
  ],
  "historicalTrends": {
    "sessionsAnalyzed": 5,
    "avgTeamFulfillmentRate": 0.71,
    "recurringCarryOvers": [{ "taskTitle": "...", "daysOpen": 3 }],
    "lowPerformerPattern": []
  }
}
```

### Response expected from Groq
```json
{
  "riskScore": 67,
  "riskLevel": "medium",
  "summary": "Sprint 3 is mid-pace. Charlie's API Integration task has been blocked for 2 days with no movement — needs immediate standup attention. Team fulfillment rate is 71%.",
  "nudges": [
    { "userId": "...", "taskId": "...", "message": "Task 'API Integration' has been open for 2 days with zero movement — ask Charlie for a blocker update today." }
  ],
  "trends": [
    "Bob consistently logs fewer hours on authentication tasks than estimated",
    "Charlie's tasks in the 'API Integration' category are frequently blocked by external dependencies"
  ],
  "prioritySuggestions": [
    "Unblock API Integration first — Diana's testing task depends on it",
    "If API credentials aren't received by EOD, escalate to account manager"
  ]
}
```

### System prompt (sent to Groq)
```
You are a sprint health analyst for a software team. You receive daily standup data and return a structured JSON analysis.

Rules:
- riskScore: 0 (no risk) to 100 (sprint will definitely fail). Base it on: fulfillment rate, days remaining, tasks not started, recurring blockers.
- riskLevel: "low" (0-30), "medium" (31-60), "high" (61-80), "critical" (81-100)
- nudges: max 3, only for tasks with zero movement or open blocker notes older than 1 day
- trends: max 3, only surface if pattern appears in 3+ historical sessions
- prioritySuggestions: max 3, actionable, specific to the sprint state

Return only valid JSON. No markdown, no explanation text outside JSON.
```

---

## 9. API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/standup/sessions` | full-view role | List sessions for a project (`?projectId=&date=`) |
| POST | `/api/standup/sessions` | full-view role | Create today's session for a project |
| GET | `/api/standup/sessions/[id]` | member of project | Get full session (filtered by role) |
| GET | `/api/standup/sessions/[id]/briefing` | full-view role | Get pre-standup snapshot |
| POST | `/api/standup/sessions/[id]/commitments` | full-view role | Add/replace commitments for a user (bulk) |
| GET | `/api/standup/sessions/[id]/commitments` | member of project | List commitments (filtered by role) |
| PUT | `/api/standup/sessions/[id]/commitments/[cId]` | full-view role | Update a commitment record |
| PUT | `/api/standup/sessions/[id]/commitments/[cId]/note` | full-view role | Add/update PM note |
| DELETE | `/api/standup/sessions/[id]/commitments/[cId]/note` | full-view role | Resolve/remove PM note |
| POST | `/api/standup/sessions/[id]/analyze` | full-view role | Manually trigger Groq analysis |
| POST | `/api/standup/sessions/[id]/complete` | full-view role | Mark session completed |
| GET | `/api/standup/trends` | full-view role | Historical trend data (`?projectId=&days=`) |
| GET | `/api/standup/my-commitments` | any member | Current user's commitments across projects |

---

## 10. Service Layer

### `src/lib/services/standup-briefing.service.ts`
```
buildBriefingSnapshot(projectId, date, previousSession)
  → query yesterday's StandupCommitments
  → for each task: check Task.status, query ActivityLog for status changes in circle
  → identify noMovement, zeroTime, gaps
  → pull unresolved pmNotes from previous sessions
  → return briefingSnapshot object

detectNoMovement(taskIds: ObjectId[], circleStart: Date, circleEnd: Date)
  → query ActivityLog where action='task_status_changed', entityId IN taskIds, createdAt in range
  → return Set of taskIds that had at least one log (moved)
  → everything NOT in that set = no movement

aggregateTimeLogs(userIds, taskIds, circleStart, circleEnd)
  → query TimeEntry where user IN userIds, task IN taskIds, startTime >= circleStart, endTime <= circleEnd
  → group by user + task, sum duration
  → return Map<userId_taskId, totalMinutes>
```

### `src/lib/services/standup-analysis.service.ts`
```
buildGroqPayload(session, commitments, historicalSessions)
  → assembles the full JSON payload for Groq

callGroq(payload)
  → POST to Groq API with system prompt + user payload
  → parse JSON response
  → validate structure (riskScore, riskLevel, nudges, trends, prioritySuggestions)
  → return parsed analysis

saveAnalysis(sessionId, analysis)
  → update StandupSession.analysis
  → push Socket.io event to project room: 'standup:analysis-ready'

runEodAnalysis(projectId, date)
  → orchestrates briefing → payload build → Groq call → save
  → called by scheduled job and manual trigger
```

### `src/lib/services/standup-scheduler.service.ts`
```
scheduleEodAnalysis()
  → uses Bull queue (already in project)
  → fires daily at 08:00 AM server time
  → finds all projects with active sprints
  → calls runEodAnalysis(projectId, today) for each

shouldRunAnalysis(projectId, date)
  → checks if StandupSession for this project+date already has analysis
  → returns false if already done (idempotent)
```

---

## 11. Frontend Pages & Components

### Pages
```
src/app/standup-dashboard/
├── page.tsx                    # Project list — "Start Today's Standup" per project
└── [sessionId]/
    └── page.tsx                # Active session view (pre + live + post panels)
```

### Components
```
src/components/standup/
├── PreStandupPanel.tsx         # Yesterday's results, gaps, no-movement flags, open notes
├── CommitmentCapture.tsx       # Per-person task selection (PM assigns today's tasks)
├── PMNoteModal.tsx             # Add/edit PM note on a flagged task
├── PostStandupPanel.tsx        # Today's commitments with real-time status
├── AnalysisReport.tsx          # Groq output: risk score, trends, suggestions
├── RiskScoreGauge.tsx          # Visual gauge (Recharts RadialBarChart)
├── TrendPanel.tsx              # 7-day fulfillment rate chart per person (Recharts)
├── NudgeList.tsx               # AI-generated nudges display
├── MemberCommitmentRow.tsx     # Single row: member name + their tasks + status icons
└── StandupProjectCard.tsx      # Project card on dashboard list page
```

### Member (Own Data) View Components
```
src/components/standup/member/
├── MyCommitmentsPanel.tsx      # Member sees their own tasks only
└── MyPMNoteView.tsx            # Read-only PM note addressed to them
```

---

## 12. Environment Variables to Add

```env
GROQ_API_KEY=                         # Groq API key
GROQ_MODEL=llama-3.3-70b-versatile    # or mixtral-8x7b-32768
STANDUP_ANALYSIS_HOUR=8               # Hour (24h) when EOD analysis job fires (default: 8 = 8 AM)
STANDUP_WORKING_CIRCLE_START_HOUR=9   # Hour standup/working circle begins (default: 9 = 9 AM)
```

---

## 13. Implementation Build Order

Tasks marked with status as implementation progresses.

### Phase A — Data Layer ✅ COMPLETE
- [x] **A1** — Create `src/models/StandupSession.ts`
- [x] **A2** — Create `src/models/StandupCommitment.ts`
- [x] **A3** — Export both from `src/models/index.ts`
- [x] **A4** — Install Groq SDK: `npm install groq-sdk`

### Phase B — Service Layer ✅ COMPLETE
- [x] **B1** — Create `src/lib/services/standup-briefing.service.ts`
  - `detectNoMovement()`, `aggregateTimeLogs()`, `buildBriefingSnapshot()`, `computeHistoricalTrends()`
- [x] **B2** — Create `src/lib/services/standup-analysis.service.ts`
  - `buildGroqPayload()`, `callGroq()`, `saveAnalysis()`, `runEodAnalysis()`
- [x] **B3** — Create `src/lib/services/standup-scheduler.service.ts`
  - Bull job registration, `scheduleEodAnalysis()`, `enqueueSessionAnalysis()`, idempotency check, `registerDailyStandupJob()`

### Phase C — API Routes ✅ COMPLETE
- [x] **C1** — `GET/POST /api/standup/sessions` — list + create sessions (with briefing snapshot on creation)
- [x] **C2** — `GET /api/standup/sessions/[id]` — get session (role-filtered via `filterSessionByAccess`)
- [x] **C3** — `GET /api/standup/sessions/[id]/briefing` — pre-standup snapshot (cached + refresh)
- [x] **C4** — `GET/POST /api/standup/sessions/[id]/commitments` — commitments CRUD (upsert per user)
- [x] **C5** — `PUT/DELETE /api/standup/sessions/[id]/commitments/[cId]/note` — PM note (soft delete = resolve)
- [x] **C6** — `POST /api/standup/sessions/[id]/analyze` — manual Groq trigger (idempotent, force flag)
- [x] **C7** — `POST /api/standup/sessions/[id]/complete` — close session
- [x] **C8** — `GET /api/standup/trends` — historical trend data (14-day default, max 90)
- [x] **C9** — `GET /api/standup/my-commitments` — member personal view (own data, no role gate)
- [x] **Auth guard** — `src/lib/standup-auth.ts` — `getStandupAccessLevel()`, `filterSessionByAccess()`

### Phase D — Frontend (Full View — PM/Admin/HR) ✅ COMPLETE
- [x] **D1** — `src/app/standup-dashboard/page.tsx` — project list entry (sorted by session status)
- [x] **D2** — `StandupProjectCard.tsx` — per-project card with session status + risk badge
- [x] **D3** — `src/app/standup-dashboard/[sessionId]/page.tsx` — full session page (4 tabs)
- [x] **D4** — `PreStandupPanel.tsx` — open notes, gaps, no-movement flags with member names
- [x] **D5** — `MemberCommitmentRow.tsx` — per-member task row with status icons + time logged
- [x] **D6** — `CommitmentCapture.tsx` — task selection per member during standup
- [x] **D7** — `PMNoteModal.tsx` — add/edit PM note with blocker + target resolution fields
- [x] **D8** — `AnalysisReport.tsx` + `RiskScoreGauge.tsx` — AI output display
- [x] **D9** — `TrendPanel.tsx` — fulfillment bar chart (Recharts) + AI patterns + stuck tasks
- [x] **D10** — `NudgeList.tsx` — AI nudges display

### Phase E — Frontend (Own Data — Team Member) ✅ COMPLETE
- [x] **E1** — `MyCommitmentsPanel.tsx` — member personal view with task status icons + PM note read-only
- [x] **E2** — Own-data view integrated in session page (role check → filtered render)

### Phase F — Integration & Polish
- [x] **F3** — Add Groq env vars to `env.example`
- [x] **F1** — Socket.io broadcast wired in `saveAnalysis()` (`standup:analysis-ready` event)
- [ ] **F2** — Add standup sidebar nav item (pending — requires sidebar component edit)
- [ ] **F4** — End-to-end test of full daily cycle (pending — needs GROQ_API_KEY in env)

---

## 14. Key Technical Decisions

| Decision | Choice | Reason |
|---|---|---|
| LLM provider | Groq (`llama-3.3-70b-versatile`) | Fast inference, cost-effective, JSON output reliable |
| Job scheduling | Bull (already in project) | Redis-backed, already configured in the codebase |
| Session scope | Project (not sprint) | Sprint may be absent; project is always the container |
| Member snapshot | Captured at session creation | Protects against mid-day membership changes affecting the record |
| Role resolution | projectRoles first → org role fallback | Matches existing permission-service.ts pattern |
| Carry-forward | By task status (live check) | Always reflects ground truth from Task collection |
| Analysis idempotency | Check `analysis.generatedAt` before running | Prevents double-billing on Groq if job fires twice |

---

## 15. Out of Scope (Explicitly)

- Zoom API integration
- Audio recording or transcription (Sinhala or English)
- Gemini or any speech-to-text model
- Screen sharing or video capture
- External calendar or scheduling integration
- Replacing PM judgment — the system surfaces, the PM acts

---

*Kanavaro · AI Standup Dashboard · v2.0 · Internal*
*Last updated: 2026-05-26 — full implementation plan added*
