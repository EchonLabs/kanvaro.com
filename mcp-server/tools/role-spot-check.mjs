// Task 0.5 — spot checks per role for the findings that depend on who is asking:
// search scoping (F4), members field exposure (F1), project visibility.
//   node mcp-server/tools/role-spot-check.mjs [baseUrl]
// Needs .test-users.json. Reads only; prints field NAMES, never values.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const creds = JSON.parse(fs.readFileSync(path.join(here, '.test-users.json'), 'utf8'))
const TERM = process.env.SEARCH_TERM || 'test'

async function login(role) {
  const u = creds.users[role]
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, password: u.password }) })
  const c = (r.headers.getSetCookie?.() || []).map(x => x.split(';')[0]).find(x => x.startsWith('accessToken='))
  if (!c) throw new Error(`login ${role}: ${r.status}`)
  return c.slice('accessToken='.length)
}
const get = async (p, tok) => {
  const r = await fetch(`${BASE}/api/${p}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
  let j = null; try { j = await r.json() } catch {}
  return { status: r.status, json: j }
}
const SENSITIVE = ['password', 'passwordResetOtp', 'passwordResetToken', 'passwordResetExpiry', 'hourlyRate', 'billingRate']

for (const role of ['viewer', 'client', 'team_member', 'project_manager', 'admin']) {
  const tok = await login(role)
  const projects = await get('projects?limit=50', tok)
  const search = await get(`search?q=${encodeURIComponent(TERM)}`, tok)
  const members = await get('members?limit=50', tok)
  const list = members.json?.data?.members || members.json?.data || members.json?.members || []
  const exposed = new Set()
  for (const m of Array.isArray(list) ? list : []) for (const k of SENSITIVE) if (k in m) exposed.add(k)
  const types = (search.json?.results || []).reduce((a, r) => (a[r.type] = (a[r.type] || 0) + 1, a), {})
  console.log(JSON.stringify({
    role,
    projectsVisible: projects.json?.data?.length ?? projects.json?.projects?.length ?? `status ${projects.status}`,
    search: { status: search.status, resultTypes: types },
    members: { status: members.status, count: Array.isArray(list) ? list.length : 0, sensitiveFieldsReturned: [...exposed] },
  }))
}
