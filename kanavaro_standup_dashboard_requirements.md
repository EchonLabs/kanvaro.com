# Kanavaro — AI Standup Dashboard
**Feature Requirement · v1.1 · Internal**
*Compiled from: voice note briefing, team chat discussion, and internal requirement document*

---

## 1. Overview

The AI Standup Dashboard is a **live, interactive dashboard inside Kanavaro** that gives the PM a real-time view of team commitments versus actual task delivery. It surfaces gaps, blockers, and sprint risk automatically — driven by task board activity and PM-entered standup notes. 

**This is not a Zoom integration. This is not a meeting recorder.** Everything runs through Kanavaro's existing project management task module, using card movement, due dates, and status changes as the primary data source.

---

## 2. What Changed (Requirement Evolution)

| Previous Assumption | Current Requirement |
|---|---|
| Use Zoom API to pull meeting recordings | No Zoom integration needed |
| Transcribe audio using Gemini (Sinhala + English) | Not required for this feature |
| Audio-based speaker identification | Not applicable |
| Meeting-driven standup capture | Task board–driven standup capture |

> **Summary:** The team initially explored capturing standup audio via Zoom and transcribing it with Gemini (to handle both Sinhala and English). This was dropped. The standup dashboard is now entirely driven by **Kanavaro's task board data** — card movements, status updates, due dates, and PM-entered notes.

---

## 3. Core Concept

Each daily standup cycle works in three phases:

### Phase 1 — Pre-Standup Briefing
Before the standup begins, the PM sees a live snapshot of:
- What each team member committed to completing yesterday
- Which of those commitments are still not marked as done in Kanavaro
- Tasks where no status movement has happened since the last standup (auto-flagged)
- The board refreshes automatically before each standup window

### Phase 2 — During Standup (Live Capture)
- Every task a team member commits to finishing **that day** is added to the board one by one, assigned to that person
- This is not pulled from the general backlog view — it is a deliberate, per-person, per-task commitment captured during the standup itself
- The PM can enter a short note against any flagged issue, for example: *"Discussed in standup — blocker is X — must be resolved by 4PM today"*

### Phase 3 — Post-Standup Summary + Follow-Up
- Today's commitments are captured per person
- Yesterday's commitments are cross-referenced against completed tasks — gaps are highlighted
- PM comments and feedback are visible per task, per person
- The dashboard can be exported to the Kanavaro task board with one action

---

## 4. Logical Flow (Detailed)

```
Task board activity (card moves, status changes)
        ↓
Pre-standup briefing surfaces incomplete items
        ↓
PM reviews → standup begins
        ↓
Per-person daily commitments are added + assigned live
        ↓
PM logs notes on flagged or blocked items
        ↓
Next day: system checks completion against agreed timelines
        ↓
Unresolved items are surfaced again with PM's original note
        ↓
PM is prompted to follow up: "You flagged this yesterday — ask for an update today"
        ↓
Trends accumulate over days → ongoing patterns are surfaced
        ↓
Sprint risk score is calculated and shown to PM daily
```

---

## 5. Feature Requirements

### 5.1 Task Tracking
- Monitor all card movements: **To Do → In Progress → Done**
- Track status changes based on task due dates and per-member assignments
- Flag tasks with no movement since the last standup automatically
- All tracking is done through the existing Kanavaro project management module — no external tool required

### 5.2 Daily Standup Commitment Capture
- During standup, tasks committed for the day are added one by one per person
- Each task is explicitly assigned to the relevant team member
- This is separate from the general task board — it is a focused daily commitment layer on top

### 5.3 PM Note System
- For any flagged or blocked item, the PM can type a short contextual note
- Notes should capture: what was discussed, what the blocker is, and the expected resolution time
- Notes persist and are visible in the next day's briefing for follow-up tracking
- Example note format: *"Discussed in standup on [date] — [blocker] — target resolution: [time/date]"*

### 5.4 Follow-Up Nudges (AI Layer)
- The system proactively reminds the PM each day about items with open notes that are still unresolved
- Nudge format: *"You added a note about [task] on [date] — it's still unresolved — follow up in today's standup"*
- This removes the need for the PM to manually remember what was flagged previously

### 5.5 Trend Detection (AI Layer)
- As standup data accumulates over multiple days, the system identifies recurring patterns:
  - Tasks that are consistently carried over without completion
  - Team members who frequently miss their daily commitments
  - Blockers that recur across multiple cycles
- Trends are surfaced passively on the dashboard — the PM does not need to query for them

### 5.6 Sprint Risk View (AI Layer)
- Every day, the PM sees a live sprint risk calculation:
  - How many tasks were pulled from backlog into the sprint
  - How much estimated time remains on each task
  - What is the probability of not completing the sprint at the current pace
- If the sprint is at risk, the system suggests which specific tasks need to be actively tracked in every daily standup to hit 100% completion

---

## 6. Dashboard Panels

### Pre-Standup Panel
| Item | Description |
|---|---|
| Per-person commitment list | What each member committed to yesterday |
| Gap flags | Which commitments are still not marked done |
| No-movement alerts | Tasks with no status update since last standup |
| Auto-refresh | Refreshes automatically before the standup window |

### Post-Standup Panel
| Item | Description |
|---|---|
| Today's commitments | Captured per person during standup |
| Yesterday vs. today comparison | Gaps between what was promised and what was delivered |
| PM notes | Comments and follow-up flags visible per task, per person |
| Export action | Push summary to Kanavaro task board in one click |

---

## 7. Key Technical Requirements

| Area | Requirement |
|---|---|
| **Input** | Kanavaro task board data — card status, due dates, assignments, movement history |
| **Processing** | Rule-based gap detection + AI layer for trend analysis and risk scoring |
| **Dashboard** | Live and interactive — not a static report. Refreshes each standup cycle (daily) |
| **PM Actions** | Add notes per task/person · Flag items · Mark resolved · Trigger follow-up nudges |
| **Frequency** | Resets and refreshes every standup cycle. Historical view available by date |
| **AI Layer** | Trend detection, sprint risk scoring, proactive PM nudges |
| **No dependency on** | Zoom, audio recording, speech transcription, or external meeting tools |

---

## 8. What the AI Layer Does (and Doesn't Do)

### AI handles:
- Surfacing recurring trends across multiple standup cycles
- Calculating sprint risk based on remaining time vs. task load
- Generating proactive PM nudge messages for unresolved flagged items
- Suggesting which tasks to prioritize in standup based on sprint completion risk

### AI does NOT handle:
- Audio transcription or speaker identification
- Meeting recording or Zoom integration
- Replacing the PM's judgment — it surfaces information, the PM acts on it

---

## 9. Success Criteria

- PM can walk into a standup with a complete picture of yesterday's gaps — without manually checking the board
- Every daily commitment is captured and traceable back to a specific person and date
- No flagged issue falls through the cracks across standup cycles
- PM receives a daily sprint risk signal with specific action suggestions
- Trends across 3+ standup days are visible without the PM needing to query or filter manually

---

## 10. Out of Scope (Explicitly)

- Zoom API integration
- Audio recording or transcription (Sinhala or English)
- Gemini or any speech-to-text model
- Screen sharing or video capture
- External calendar or scheduling integration

---

*Kanavaro · AI Standup Dashboard · Internal Requirement Document · v1.1*
*Last updated based on voice briefing + team chat clarification*
