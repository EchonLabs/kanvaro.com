/**
 * Tool descriptions (task 4.2), all in one place so they are reviewed together.
 *
 * The AI client chooses tools from these texts alone, so each one says:
 *   does     what it does (starts with a verb, one or two sentences)
 *   when     when to use it, and which tool to use instead for nearby needs
 *   example  one realistic input (checked against the tool's schema in tests)
 *   cannot   what it cannot do
 * About five lines each.
 *
 * Wording rules, the same in every description and tool input:
 * - "you" is the signed-in Kanvaro user. Every tool sees only what you can see in Kanvaro;
 *   that is said once in the server instructions, not in every tool.
 * - Ids are Kanvaro ids (24 hexadecimal characters) and come from the list tools. Input
 *   names: `id` for the item itself; `projectId`, `sprintId`, `epicId`, `storyId`,
 *   `taskId`, `assigneeId` for filters.
 * - Dates are `from` / `to`, as YYYY-MM-DD.
 * - Free text is `search`. Extra sections of one item are `include: [...]`. Tools that read
 *   several kinds of thing take `part`.
 * - List tools also take `page` and `limit` (added by the wrapper; not repeated here).
 * - Tool names are snake_case: `<things>_list`, `<thing>_get`, otherwise a short noun.
 */

export interface ToolDescription {
  does: string
  when: string
  example: Record<string, unknown>
  cannot: string
}

// Example ids (valid format, not real records).
const PROJECT = '6650f1c2a9e4b3d2c1f00a11'
const SPRINT = '6650f1c2a9e4b3d2c1f00b22'
const TASK = '6650f1c2a9e4b3d2c1f00c33'
const STORY = '6650f1c2a9e4b3d2c1f00d44'
const EPIC = '6650f1c2a9e4b3d2c1f00e55'
const STANDUP = '6650f1c2a9e4b3d2c1f01077'
const POKER = '6650f1c2a9e4b3d2c1f01188'

export const DESCRIPTIONS = {
  // --- Projects and work items --------------------------------------------------------
  projects_list: {
    does: 'Lists the Kanvaro projects you can see, with status, priority and dates.',
    when: 'Use it to find a project and its id, or to answer "which projects are active?". For one project in detail, use project_get.',
    example: { search: 'website', status: 'active' },
    cannot: 'It cannot show a project\'s tasks (use project_tasks or tasks_list) or change a project.',
  },
  project_get: {
    does: 'Gets one project. With include it adds the team, insights, statuses, task categories, versions, attachments, working calendar, working days, member capacity or stand-up settings.',
    when: 'Use it when you have a project id and need its details or configuration. Ask only for the sections you need.',
    example: { id: PROJECT, include: ['team', 'statuses'] },
    cannot: 'It cannot change the project. Budget figures are in finance_get; rates are never shown here.',
  },
  project_tasks: {
    does: 'Lists all tasks of one project, grouped as Kanvaro shows them on the project board.',
    when: 'Use it for a whole-board view of one project. To filter (by status, assignee, sprint, dates), use tasks_list instead.',
    example: { id: PROJECT },
    cannot: 'It cannot filter or sort, and it cannot change tasks.',
  },
  tasks_list: {
    does: 'Lists tasks with filters: project, sprint, story, status, priority, type, category, assignee, creator, due and created dates, backlog only, and text search.',
    when: 'Use it for questions like "my open tasks", "bugs due this week" or "the backlog of project X". For "my" tasks, use assigneeId "me". With view "backlog" it lists the backlog.',
    example: { projectId: PROJECT, status: 'in_progress', assigneeId: 'me' },
    cannot: 'It cannot show comments or history (use task_get) or change tasks.',
  },
  task_get: {
    does: 'Gets one task with its comments. With include it adds the change history (paged by cursor), dependencies and attachments.',
    when: 'Use it when you have a task id and need its full details, discussion or history.',
    example: { id: TASK, include: ['history'] },
    cannot: 'It cannot change the task, add comments or download attachments.',
  },
  stories_list: {
    does: 'Lists user stories, filtered by project, epic, sprint, status, priority or text.',
    when: 'Use it to find stories and their ids, or to see what an epic or sprint contains at story level.',
    example: { projectId: PROJECT, status: 'inprogress' },
    cannot: 'It cannot list a story\'s tasks (use tasks_list with storyId) or change stories.',
  },
  story_get: {
    does: 'Gets one user story with its acceptance criteria. With include it adds attachments.',
    when: 'Use it when you have a story id and need its full details.',
    example: { id: STORY },
    cannot: 'It cannot change the story.',
  },
  epics_list: {
    does: 'Lists epics, filtered by project, status, priority or text.',
    when: 'Use it to find epics and their ids, or to get an overview of large pieces of work in a project.',
    example: { projectId: PROJECT, status: 'todo' },
    cannot: 'It cannot list an epic\'s stories (use stories_list with epicId) or change epics.',
  },
  epic_get: {
    does: 'Gets one epic. With include it adds attachments.',
    when: 'Use it when you have an epic id and need its full details.',
    example: { id: EPIC },
    cannot: 'It cannot change the epic.',
  },

  // --- Sprints and stand-ups ----------------------------------------------------------
  sprints_list: {
    does: 'Lists sprints, filtered by project, status or text.',
    when: 'Use it to find the current or a past sprint and its id, e.g. "the active sprint of project X".',
    example: { projectId: PROJECT, status: 'active' },
    cannot: 'It cannot list a sprint\'s tasks (use tasks_list with sprintId) or start, close or change sprints.',
  },
  sprint_get: {
    does: 'Gets one sprint. With include it adds analytics, the planning session and checklist, stand-ups, planning-poker sessions and attachments.',
    when: 'Use it for sprint progress, goals and planning. Ask only for the sections you need.',
    example: { id: SPRINT, include: ['analytics'] },
    cannot: 'It cannot change the sprint or its planning.',
  },
  sprint_events: {
    does: 'Lists sprint events (planning, review, retrospective, daily stand-up, demo), or gets one by id.',
    when: 'Use it for "when is the next retro?" or to see the events of a sprint.',
    example: { sprintId: SPRINT, eventType: 'retrospective' },
    cannot: 'It cannot create, change or cancel events.',
  },
  standup_get: {
    does: 'Gets one stand-up. With include it adds allocations, blockers, carry-forward items, checks, debt, summary, variance, yesterday\'s view and the sprint-close view.',
    when: 'Use it when you have a stand-up id (from sprint_get or my_standup) and need its details.',
    example: { id: STANDUP, include: ['blockers', 'summary'] },
    cannot: 'It cannot submit or change a stand-up.',
  },
  my_standup: {
    does: 'Gets your own stand-up for today and the tasks Kanvaro suggests for it.',
    when: 'Use it for "what is on my stand-up today?".',
    example: {},
    cannot: 'It cannot submit your stand-up or show other people\'s.',
  },
  standup_health: {
    does: 'Shows stand-up health: participation and problems over a period, for a sprint or the whole organisation.',
    when: 'Use it for "how are stand-ups going in this sprint?" or an oversight view for managers.',
    example: { sprintId: SPRINT, from: '2026-11-01', to: '2026-11-21' },
    cannot: 'It cannot change stand-up settings.',
  },
  poker_get: {
    does: 'Gets planning-poker sessions: the ones open for you, one session, its results, or the reveal state of one task.',
    when: 'Use it to see which estimates are waiting for you or what a session decided.',
    example: { id: POKER },
    cannot: 'It cannot vote, reveal or finalise estimates.',
  },

  // --- Overview -------------------------------------------------------------------------
  dashboard: {
    does: 'Gets your Kanvaro dashboard: your summary of projects, tasks and deadlines.',
    when: 'Use it for a quick "what is going on?" overview before looking at details.',
    example: {},
    cannot: 'It cannot show other people\'s dashboards.',
  },
  activity_list: {
    does: 'Lists recent activity (who changed what), filtered by project, user, kind of item, action, period or text.',
    when: 'Use it for "what happened on project X this week?" or "what did this person change?".',
    example: { projectId: PROJECT, dateRange: 'week' },
    cannot: 'It cannot undo changes or show the content of each change.',
  },
  calendar: {
    does: 'Lists calendar entries between two dates: due dates, sprints, events and other dated items.',
    when: 'Use it for "what is due next week?" or to plan around deadlines.',
    example: { from: '2026-12-01', to: '2026-12-07' },
    cannot: 'It cannot add or move entries.',
  },
  notifications_list: {
    does: 'Lists your notifications, optionally only unread ones or of one type.',
    when: 'Use it for "what have I been notified about?".',
    example: { unreadOnly: true },
    cannot: 'It cannot mark notifications as read or show other people\'s.',
  },
  reports: {
    does: 'Gets a report: overview, budget, burn rate, velocity, sprint, team performance, projects, team, Gantt or financial.',
    when: 'Use it for summary numbers and trends. Financial reports need Kanvaro\'s financial permission.',
    example: { report: 'velocity', projectId: PROJECT },
    cannot: 'It cannot export files or build custom reports.',
  },

  // --- Organisation and other modules ---------------------------------------------------
  people_list: {
    does: 'Lists people in your organisation (id, name, email, role), or gets one person.',
    when: 'Use it to find someone\'s id before filtering by assignee, or to see who has which role.',
    example: { search: 'priya' },
    cannot: 'It cannot invite, change or remove people. Rates and personal details are never shown.',
  },
  organization_get: {
    does: 'Gets organisation information: profile, settings, holiday sets and holidays, roles, or time-tracking settings.',
    when: 'Use it for "which holidays apply?" or "what can this role do?".',
    example: { part: 'roles' },
    cannot: 'It cannot change organisation settings, roles or holidays. API keys are never shown.',
  },
  finance_get: {
    does: 'Gets financial data: budgets, burn rate, and project expenses and income.',
    when: 'Use it for "how much of the budget is left?" or "expenses this month". Income needs Kanvaro\'s income permission.',
    example: { part: 'budget', projectId: PROJECT },
    cannot: 'It cannot add or change budgets, expenses or income.',
  },
  testing_get: {
    does: 'Gets test management data: test cases and their history, test plans, test suites, test executions and test reports.',
    when: 'Use it for "which tests failed in this project?" or to find a test case.',
    example: { part: 'test_executions', projectId: PROJECT, status: 'failed' },
    cannot: 'It cannot create, run or change tests.',
  },
  docs_get: {
    does: 'Gets Kanvaro help documents, or document, project and task templates.',
    when: 'Use it for "how do I … in Kanvaro?" or to find a template.',
    example: { part: 'docs', search: 'sprint planning' },
    cannot: 'It cannot download template files or change templates.',
  },
  time_view: {
    does: 'Gets time tracking: time entries, totals, your running timer, and (with permission) team timers, per-employee views and time reports.',
    when: 'Use it for "how many hours did I log this week?" or "time spent on project X".',
    example: { part: 'entries', from: '2026-11-17', to: '2026-11-21' },
    cannot: 'It cannot start or stop timers or change entries.',
  },
  search: {
    does: 'Searches projects, tasks, stories and other items by text, with optional filters.',
    when: 'Use it when you know words from an item but not where it is.',
    example: { q: 'login bug', type: 'task' },
    cannot: 'It cannot search inside attachments.',
  },
} as const satisfies Record<string, ToolDescription>

export type DescribedTool = keyof typeof DESCRIPTIONS

/** The description text sent to clients for one tool. */
export function descriptionOf(name: DescribedTool): string {
  return formatDescription(DESCRIPTIONS[name])
}

export function formatDescription(d: ToolDescription): string {
  return `${d.does}\n${d.when}\nExample input: ${JSON.stringify(d.example)}\n${d.cannot}`
}
