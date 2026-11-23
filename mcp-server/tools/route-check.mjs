// Task 0.5 — checks how every Kanvaro GET route authenticates.
// Signs in through /api/auth/login with the seeded test users, then calls each GET
// route three ways: no auth, Bearer token only, cookie only.
//
//   node mcp-server/tools/route-check.mjs [baseUrl]        (default http://localhost:3000)
//
// Needs mcp-server/tools/.test-users.json from seed-test-users.cjs.
// Only GET routes are called; routes that run jobs or hold connections open are skipped.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const creds = JSON.parse(fs.readFileSync(path.join(here, '.test-users.json'), 'utf8'))
const ORG = creds.organization

// GET routes that must not be called by a scanner (side effects or never-ending responses)
const SKIP = [/^cron\//, /^debug\//, /^setup\//, /^auth\/(?!me$|permissions$)/, /stream$/, /^realtime/,
  /^test-email/, /^email/, /^uploads\//, /^notifications\/subscribe/, /^health$/, /export$/]

function listGetRoutes(dir = path.join(root, 'src/app/api'), prefix = '') {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...listGetRoutes(p, prefix ? `${prefix}/${e.name}` : e.name))
    else if (e.name === 'route.ts' && /export\s+(async\s+function|const)\s+GET\b/.test(fs.readFileSync(p, 'utf8'))) out.push(prefix)
  }
  return out
}

async function login(role) {
  const u = creds.users[role]
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: u.password }),
  })
  const cookies = r.headers.getSetCookie?.() || []
  const get = n => cookies.map(c => c.split(';')[0]).find(c => c.startsWith(n + '='))?.slice(n.length + 1)
  if (r.status !== 200 || !get('accessToken')) throw new Error(`login ${role} failed: ${r.status}`)
  return { access: get('accessToken'), refresh: get('refreshToken') }
}

async function call(url, mode, tok) {
  const headers = {}
  if (mode === 'bearer') headers.Authorization = `Bearer ${tok.access}`
  if (mode === 'cookie') headers.Cookie = `accessToken=${tok.access}`
  try {
    const r = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(120000) })
    const text = await r.text()
    return { status: r.status, bytes: text.length, body: text }
  } catch (e) { return { status: 'ERR', bytes: 0, body: String(e.message) } }
}

function urlFor(route, ids) {
  let u = route
    .replace(/^projects\/\[id\]/, `projects/${ids.project}`)
    .replace(/\[id\]|\[setId\]|\[taskId\]/g, ids.random)
  const q = new URLSearchParams()
  if (u.startsWith('time-tracking')) { q.set('organizationId', ORG); q.set('userId', ids.user) }
  if (u === 'search') q.set('q', ids.searchTerm)
  return `${BASE}/api/${u}${q.size ? '?' + q : ''}`
}

function classify(none, bearer, cookie) {
  const authed = s => s !== 401 && s !== 'ERR'
  if (authed(none.status) && none.status < 400) return 'NO AUTH (open)'
  if (authed(bearer.status)) return 'Bearer OK'
  if (bearer.status === 401 && authed(cookie.status)) return 'COOKIE ONLY'
  return `unclear (${none.status}/${bearer.status}/${cookie.status})`
}

const main = async () => {
  const admin = await login('admin')
  const ids = {
    user: creds.users.admin.id,
    project: process.env.PROJECT_ID || (await (await fetch(`${BASE}/api/projects?limit=1`, { headers: { Authorization: `Bearer ${admin.access}` } })).json())?.data?.[0]?._id || '000000000000000000000000',
    random: '000000000000000000000001',
    searchTerm: process.env.SEARCH_TERM || 'test',
  }
  const routes = listGetRoutes().filter(r => !SKIP.some(s => s.test(r))).sort()
  const rows = []
  for (const r of routes) {
    const url = urlFor(r, ids)
    const none = await call(url, 'none', admin)
    const bearer = await call(url, 'bearer', admin)
    const cookie = bearer.status === 401 ? await call(url, 'cookie', admin) : { status: '-' }
    rows.push({ route: r, result: classify(none, bearer, cookie), none: none.status, bearer: bearer.status, cookie: cookie.status })
    console.log(`${classify(none, bearer, cookie).padEnd(16)} none=${String(none.status).padEnd(4)} bearer=${String(bearer.status).padEnd(4)} cookie=${String(cookie.status).padEnd(4)} ${r}`)
  }
  const out = path.join(here, `.route-check-${new Date().toISOString().slice(0, 10)}.json`)
  fs.writeFileSync(out, JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), rows }, null, 2))
  const count = rows.reduce((m, r) => (m[r.result.split(' (')[0]] = (m[r.result.split(' (')[0]] || 0) + 1, m), {})
  console.log('\nsummary', count, '\nreport →', path.relative(root, out))
}

main().catch(e => { console.error(e.message); process.exitCode = 1 })
