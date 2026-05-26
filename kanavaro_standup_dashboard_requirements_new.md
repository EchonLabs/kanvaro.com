# Kanavaro — AI Standup Dashboard
**Feature Requirement · v1.1 · Internal**
*Compiled from: voice note briefing, team chat discussion, and internal requirement document*

---

## 1. Overview

The AI Standup Dashboard is a **live, interactive dashboard inside Kanavaro** that gives the PM a real-time view of team commitments versus actual task delivery. It surfaces gaps, blockers, and sprint risk automatically — driven by task board activity and PM-entered standup notes. 

Everything runs through Kanavaro's existing project management task module, using card movement, due dates, and status changes as the primary data source.

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

---

## 8. What the AI Layer Does (and Doesn't Do)

### AI handles:
- Surfacing recurring trends across multiple standup cycles
- Calculating sprint risk based on remaining time vs. task load
- Generating proactive PM nudge messages for unresolved flagged items
- Suggesting which tasks to prioritize in standup based on sprint completion risk

### AI does NOT handle:
- Replacing the PM's judgment — it surfaces information, the PM acts on it

---

## 9. Success Criteria

- PM can walk into a standup with a complete picture of yesterday's gaps — without manually checking the board
- Every daily commitment is captured and traceable back to a specific person and date
- No flagged issue falls through the cracks across standup cycles
- PM receives a daily sprint risk signal with specific action suggestions
- Trends across 3+ standup days are visible without the PM needing to query or filter manually

---

---

*Kanavaro · AI Standup Dashboard · Internal Requirement Document · v1.1*
*Last updated based on voice briefing + team chat clarification*

---

## 11. Raw Source Material

> These are the original, unedited inputs used to compile this requirements document. Preserved here so Claude Code has the full context and original intent behind each decision.

---

### 11.1 Voice Note Transcript (Dulan — Original Briefing to Lakith)

**Sinhala (Original):**

```
ලකිත්, ඒක මෙහෙමයි. දැන් මුලින්ම logical flow එකෙන් මම ඊයේ කිව්වා වගේ, every stand-up එකට 
කලින් දවසේ move කරපු, drag කරපු දේවල් ටික ඉවර වෙලාද, status මාරු වෙලාද කියලා ඒවා track 
වෙන්න ඕනේ. එතකොට මෙතනදි නිකන්ම අර task board එකේ තියෙන ඒවත් බැහැ, daily stand-up එකේදී 
හැමෝම එදා දවසේ ඉවර කරන්න ගන්න task ටික ඔක්කොම one by one add වෙනවා, හැමෝටම assign වෙනවා.

එතකොට ඒ task ටික තමා පහුවදා follow up වෙන්නේ, ඒ දේවල් ටික ඒ agree වෙච්ච timelines, 
estimates වලට අනුව completed ද කියලා. යම්කිසි අවස්ථාවක දෙවෙනි දවසේ මොකක් හරි එකක issues... 
දැන් issues highlight වෙන හැම එකක්ම PM type කරන්න ඕනෙ පොඩි note එකක්, "මෙන්න මේක තමා අපි 
discuss කරේ, මෙන්න මේක නිසා මෙන්න මේක අද දවසෙ මෙන්න මේ වෙද්දි ඉවර වෙන්න ඕනෙ" කියලා. 
අන්න ඔය විදියට comment එක දාගෙන යන්න පුලුවන් highlight වෙන issues වලට.

එතකොට ඕක දැන් දවසක්, දෙකක්, තුනක් ඔහොම ඇදී ඇදී යද්දි, අපිට බලාගන්න පුලුවන් කොච්චර 
මොනවා හරි ongoing trends තියෙනවද කියලා. මෙයා එදා කියපු එක දැන් පස්සෙ දවසෙක අපිට 
බලාගන්න පුලුවන් වෙන්න පුලුවන් තාම ඉවර නැහැ කියලා. අර ඒ වගේ දේවල් highlight කරගන්න 
පුලුවන්. එතකොට එයා අර PM දාලා තිබ්බ feedback එක, "මෙයා මෙන්න මේක මේ වෙලාවේදී ඉවර 
කරනවා" කියලා update comment එකක්, ඒක තාම fix වෙලා නැහැ.

එතකොට ඕවා පිටිපස්සෙන් ගිහිල්ලා PM ට හැමදාම එන්න ඕනේ මෙන්න මේ මේ දේවල් follow up 
කරන්න, "මේ මේ දේවල් ඔයා කලින් මෙහෙම note එකක් දැම්මා, අද මෙහෙම අහලා follow up එකක් 
දාන්න" කියලා. Right? අන්න ඔය part එක එන්න ඕනේ.

ඒ වගේම මේ stand-ups ඔක්කොම ටික align වෙන්න ඕනේ ඒගොල්ලන්ගෙ sprint plan එකට. එතකොට 
හැමදාම PM ට පෙන්නන්න ඕනේ එයාලා sprint එකට මෙච්චර task ටිකක් භාරගත්තා නම් backlog එකේ 
ඉදන් 'to do' එකට, ඒ හැම task එකේම තියෙන ඉතුරු time එකත් එක්ක කොච්චර risk එකක් තියෙනවද 
මේගොල්ලන්ට දැන් එන්න එන්න මේක ඉවර කරන්න බැරි වෙන්න කියලා. ඉවර කරන්න ඕනෙ වෙනවා නම්, 
අනිවාර්යෙන් ඉවර කරන්න 100% target කරනවා නම්, "මෙන්න මේ මේ task ටිකත් ඇතුලට ගන්න වෙයි 
every daily stand-up එකේදී" කියලා suggest වෙන්න ඕනේ අර ලකිත්ට.
```

**English Translation:**

```
Lakith, it's like this. First, following the logical flow I mentioned yesterday, we need to track 
if the items moved or dragged before every stand-up are completed and whether their statuses have 
changed. Just relying on the general tasks on the task board isn't enough here; during the daily 
stand-up, every task everyone commits to finishing that day must be added one by one and assigned 
to each person.

Those specific tasks are then followed up on the next day to check if they were completed 
according to the agreed timelines and estimates. If there are issues with anything on the second 
day... for every highlighted issue, the PM needs to type a small note stating, "This is what we 
discussed, and because of this, it needs to be finished today by this time." That is how comments 
should be continuously added to highlighted issues.

As this process drags on for one, two, or three days, we will be able to identify any ongoing 
trends. We might notice on a subsequent day that a task someone previously said they would do is 
still not finished, which allows us to highlight those kinds of issues. For instance, a feedback 
note the PM entered — such as an update comment saying "this person will finish this by this 
specific time" — might still not be resolved.

Going back over these, the PM needs to be prompted daily to follow up on specific items, with 
alerts like: "You put a note about this previously, ask about it today and add a follow-up." 
Right? That part needs to be included.

And all of these stand-ups must firmly align with their sprint plan. Every day, the PM needs to 
be shown the risk level: if the team took on a certain number of tasks from the backlog to the 
'to-do' list for the sprint, what is the risk of them not being able to finish as time runs out, 
based on the remaining time for each task? If they absolutely want to finish and are targeting 
100% completion, the system needs to suggest to Lakith that "these specific tasks also need to 
be brought into every daily stand-up."
```

---

### 11.2 Team Chat Messages (EL AI Group — Raw)

**Context:** Lakith asked Dulan whether this feature could be implemented without AI integration (pure logical flow). Dulan's responses:

```
[Dulan — 12:14 PM]
Everything is tracked and monitored thru the project management tasks module

[Dulan — 12:15 PM]
Based on the task due dates and status
Movement of cards from Todo to in progress
In progress to done
And things like that
Based on today date and due dates for each task for each member of the team

[Lakith — 12:24 PM]
okay ayye, we will think about this path

[Lakith — 1:53 PM]
@Dulan Dias Sir Echonlabs Ayye this can be implemented with the logical flow ned? 
without using AI integration part?

[Dulan — 1:53 PM]
Yes mostly. That's what I said yesterday.
But preparing the ongoing daily dashboard which shows to the PM exactly what's going on, 
and PM can enter responses on what was discussed daily, then using all that we can see 
ongoing trends and issues.
That's where AI comes in

[Lakith — 1:56 PM]
okay ayye got it.
```

---

---

*Kanavaro · AI Standup Dashboard · Internal Requirement Document · v1.1*
*Raw sources appended for full traceability*
