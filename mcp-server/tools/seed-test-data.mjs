// Task 0.7 — creates sample data for the MCP role tests, through Kanvaro's own API.
// Needs Kanvaro running and the users from seed-test-users.cjs.
//
//   node mcp-server/tools/seed-test-data.mjs [baseUrl]         create
//   node mcp-server/tools/seed-test-data.mjs --remove          delete (direct DB clean-up)
//
// Everything created is named "MCP Test …" so it can be found and removed.
// IDs are written to mcp-server/tools/.test-data.json (git-ignored).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const BASE = (process.argv.find(a => a.startsWith('http')) || 'http://localhost:3000').replace(/\/$/, '')
const OUT = path.join(here, '.test-data.json')
const creds = JSON.parse(fs.readFileSync(path.join(here, '.test-users.json'), 'utf8'))
const U = Object.fromEntries(Object.entries(creds.users).map(([k, v]) => [k, v.id]))
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

// ---------------------------------------------------------------- remove
if (process.argv.includes('--remove')) {
  const require = createRequire(path.join(root, 'package.json'))
  const mongoose = require('mongoose')
  const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kanvaro2'
  if (!/localhost|127\.0\.0\.1/.test(URI) && !process.env.ALLOW_NON_LOCAL) throw new Error('Refusing: non-local database')
  await mongoose.connect(URI)
  const db = mongoose.connection.db
  const projects = await db.collection('projects').find({ name: /^MCP Test / }).project({ _id: 1 }).toArray()
  const ids = projects.map(p => p._id)
  const res = {}
  for (const c of ['tasks', 'stories', 'epics', 'sprints', 'timeentries', 'activetimers', 'sprintevents']) {
    res[c] = (await db.collection(c).deleteMany({ project: { $in: ids } })).deletedCount
  }
  res.projects = (await db.collection('projects').deleteMany({ _id: { $in: ids } })).deletedCount
  res.customroles = (await db.collection('customroles').deleteMany({ name: /^MCP Test / })).deletedCount
  await db.collection('users').updateMany({ email: /^mcp-test-.*@kanvaro\.test$/ }, { $unset: { customRole: '' } })
  console.log('removed', res)
  if (fs.existsSync(OUT)) fs.unlinkSync(OUT)
  await mongoose.disconnect()
  process.exit(0)
}

// ---------------------------------------------------------------- API helpers
const tokens = {}
async function login(role) {
  if (tokens[role]) return tokens[role]
  const u = creds.users[role]
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, password: u.password }) })
  const c = (r.headers.getSetCookie?.() || []).map(x => x.split(';')[0]).find(x => x.startsWith('accessToken='))
  if (!c) throw new Error(`login ${role}: ${r.status}`)
  return (tokens[role] = c.slice('accessToken='.length))
}
async function api(role, method, p, body, { cookie = false } = {}) {
  const tok = await login(role)
  const headers = { 'Content-Type': 'application/json', ...(cookie ? { Cookie: `accessToken=${tok}` } : { Authorization: `Bearer ${tok}` }) }
  const r = await fetch(`${BASE}/api/${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  let j; try { j = JSON.parse(text) } catch { j = text }
  if (r.status >= 400) throw new Error(`${role} ${method} ${p} → ${r.status}: ${text.slice(0, 200)}`)
  return j?.data ?? j
}
const idOf = x => x?._id || x?.id || x?.project?._id || x?.task?._id || x?.timeEntry?._id || x?.entry?._id ||
  (x && typeof x === 'object' ? Object.values(x).find(v => v && typeof v === 'object' && v._id)?._id : undefined)

// ---------------------------------------------------------------- create
const out = { createdAt: new Date().toISOString(), base: BASE, projects: {}, tasks: {} }

// 1. Custom role: a team member who may view all tasks and reports (tests "view all" via custom role)
const role = await api('admin', 'POST', 'roles', {
  name: 'MCP Test Custom Role',
  description: 'Team member who can view all tasks and reports (MCP role tests)',
  permissions: ['task:view_all', 'project:view_all', 'reporting:view'],
})
out.customRole = idOf(role)
await api('admin', 'PUT', `users/${U.custom}/role`, { customRoleId: out.customRole })

// 2. Projects. Alpha: most roles on the team. Beta: only PM and admin (others must be refused).
const alphaTeam = ['project_manager', 'team_member', 'qa_engineer', 'tester', 'client', 'viewer', 'custom', 'human_resource']
const alpha = await api('admin', 'POST', 'projects', {
  name: 'MCP Test Alpha', description: 'Main project for MCP role tests', status: 'active', priority: 'high',
  startDate: day(-30), endDate: day(60), tags: ['mcp-test'],
  teamMembers: alphaTeam.map(r => ({ memberId: U[r] })),
})
const beta = await api('admin', 'POST', 'projects', {
  name: 'MCP Test Beta', description: 'Restricted project: only PM and admin are members', status: 'active', priority: 'medium',
  startDate: day(-10), endDate: day(90), tags: ['mcp-test'],
  teamMembers: [{ memberId: U.project_manager }],
})
out.projects.alpha = idOf(alpha); out.projects.beta = idOf(beta)

const cats = {}
for (const [k, id] of Object.entries(out.projects)) {
  const p = await api('admin', 'GET', `projects/${id}`)
  cats[k] = (p?.settings?.taskCategories || [])[0]?.key || 'general'
}

// 3. Epic, stories, sprint in Alpha
const epic = await api('project_manager', 'POST', 'epics', { title: 'MCP Test Epic — Login revamp', description: 'Sample epic', project: out.projects.alpha, priority: 'high', dueDate: day(45) })
out.epic = idOf(epic)
const story1 = await api('project_manager', 'POST', 'stories', { title: 'MCP Test Story — Password login', description: 'As a user I can sign in with a password', acceptanceCriteria: ['Valid login works', 'Wrong password is refused'], project: out.projects.alpha, epic: out.epic, priority: 'high', storyPoints: 5 })
const story2 = await api('project_manager', 'POST', 'stories', { title: 'MCP Test Story — Session timeout', description: 'Sessions end after inactivity', project: out.projects.alpha, epic: out.epic, priority: 'medium', storyPoints: 3 })
out.stories = [idOf(story1), idOf(story2)]
const sprint = await api('project_manager', 'POST', 'sprints', { name: 'MCP Test Sprint 1', description: 'Current sprint', project: out.projects.alpha, startDate: day(-7), endDate: day(7), goal: 'Finish password login', capacity: 80 })
out.sprint = idOf(sprint)

// 4. Tasks — a spread of statuses, assignees and due dates (overdue, due soon, blocked, unassigned)
const T = async (key, who, project, fields) => {
  const t = await api(who, 'POST', 'tasks', { project: out.projects[project], category: cats[project], type: 'task', priority: 'medium', ...fields })
  out.tasks[key] = idOf(t)
}
await T('overdue', 'project_manager', 'alpha', { title: 'MCP Test — Fix login error message', status: 'in_progress', priority: 'high', dueDate: day(-3), assignedTo: [{ user: U.team_member }], story: out.stories[0], estimatedHours: 4 })
await T('due_soon', 'project_manager', 'alpha', { title: 'MCP Test — Add password rules', status: 'todo', dueDate: day(2), assignedTo: [{ user: U.team_member }], story: out.stories[0], estimatedHours: 6 })
await T('review', 'project_manager', 'alpha', { title: 'MCP Test — Review session code', status: 'review', dueDate: day(5), assignedTo: [{ user: U.qa_engineer }], story: out.stories[1] })
await T('testing', 'project_manager', 'alpha', { title: 'MCP Test — Test timeout on mobile', status: 'testing', dueDate: day(4), assignedTo: [{ user: U.tester }], story: out.stories[1], type: 'bug' })
await T('done', 'project_manager', 'alpha', { title: 'MCP Test — Design login page', status: 'done', dueDate: day(-10), assignedTo: [{ user: U.team_member }] })
await T('unassigned', 'project_manager', 'alpha', { title: 'MCP Test — Write release notes', status: 'backlog', priority: 'low' })
await T('team_member_own', 'team_member', 'alpha', { title: 'MCP Test — Created by team member', status: 'todo', assignedTo: [{ user: U.team_member }] })
await T('beta_secret', 'project_manager', 'beta', { title: 'MCP Test — Beta-only task (others must not see)', status: 'in_progress', dueDate: day(-1), assignedTo: [{ user: U.project_manager }] })
await T('beta_two', 'admin', 'beta', { title: 'MCP Test — Beta budget review', status: 'todo', dueDate: day(10) })

// 5. Put the first four Alpha tasks in the sprint
for (const k of ['overdue', 'due_soon', 'review', 'testing']) await api('project_manager', 'PUT', `tasks/${out.tasks[k]}`, { sprint: out.sprint })

// 6. Comments and a dependency
await api('team_member', 'POST', `tasks/${out.tasks.overdue}/comments`, { content: 'MCP Test comment: waiting for the error text from design.' })
await api('project_manager', 'POST', `tasks/${out.tasks.overdue}/comments`, { content: 'MCP Test comment: design will send it today.' })
await api('project_manager', 'POST', `tasks/${out.tasks.due_soon}/dependencies`, { targetTaskId: out.tasks.overdue, relationship: 'blocked_by' }).catch(e => (out.warnings ||= []).push(e.message))

// 7. Time entries (route reads only the cookie today — finding F3).
// Logged by HR for the team member: team members may log manually only when the organisation
// setting allowMembersToAddTimeLogs is on (off by default); admin, HR and super admin always may.
const entry = (task, start, mins, desc) => api('human_resource', 'POST', 'time-tracking/entries', {
  userId: U.team_member, organizationId: creds.organization, projectId: out.projects.alpha, taskId: out.tasks[task],
  startTime: start, endTime: new Date(new Date(start).getTime() + mins * 60000).toISOString(), duration: mins, description: desc, isBillable: true,
}, { cookie: true })
out.timeEntries = []
for (const [task, d, m, desc] of [['overdue', -2, 120, 'MCP Test — investigating error'], ['overdue', -1, 90, 'MCP Test — fix'], ['done', -9, 180, 'MCP Test — design']]) {
  try { out.timeEntries.push(idOf(await entry(task, new Date(Date.now() + d * 86400000).toISOString().slice(0, 11) + '09:00:00.000Z', m, desc))) }
  catch (e) { (out.warnings ||= []).push(e.message) }
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
console.log(JSON.stringify({ ok: true, projects: 2, epics: 1, stories: 2, sprints: 1, tasks: Object.keys(out.tasks).length, timeEntries: out.timeEntries.filter(Boolean).length, customRole: !!out.customRole, warnings: out.warnings || [] }, null, 1))
console.log('ids →', path.relative(root, OUT))
