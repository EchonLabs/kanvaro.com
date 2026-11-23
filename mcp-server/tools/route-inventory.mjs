// Task 0.6 — extracts, for every Kanvaro API handler: method, query params, body fields,
// permissions checked and auth style. Static text analysis: a starting point to verify,
// not a guarantee.
//   node mcp-server/tools/route-inventory.mjs > out.json
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const API = path.join(root, 'src/app/api')
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

function files(dir, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? files(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name)
      : e.name === 'route.ts' ? [{ route: rel, file: path.join(dir, e.name) }] : [])
}

const uniq = a => [...new Set(a)].sort()
const all = (re, s) => [...s.matchAll(re)].map(m => m[1])

function handlers(src) {
  const marks = []
  for (const m of METHODS) {
    const re = new RegExp(`export\\s+(?:async\\s+function\\s+${m}\\b|const\\s+${m}\\s*=)`, 'g')
    for (const x of src.matchAll(re)) marks.push({ m, i: x.index })
  }
  marks.sort((a, b) => a.i - b.i)
  return marks.map((x, k) => ({ method: x.m, body: src.slice(x.i, marks[k + 1]?.i ?? src.length) }))
}

function bodyFields(code) {
  const out = []
  // const { a, b: c, d = 1 } = await request.json() / body / payload / readJson(...)
  for (const m of code.matchAll(/const\s*\{([^}]+)\}\s*=\s*(?:await\s+(?:request|req)\.json\(\)|await\s+readJson\([^)]*\)|body|payload|data|updateData|rawUpdate|json)\b/g)) {
    out.push(...m[1].split(',').map(s => s.trim().split(/[:=\s]/)[0]).filter(s => /^\w+$/.test(s)))
  }
  // body.x / payload.x / updateData.x / data.x after a json() read
  if (/\.json\(\)|readJson\(/.test(code)) {
    out.push(...all(/\b(?:body|payload|updateData|rawUpdate|input)\.(\w+)/g, code))
    out.push(...all(/hasOwnProperty\.call\((?:updateData|body|payload),\s*['"](\w+)['"]\)/g, code))
  }
  return uniq(out.filter(f => !['length', 'map', 'filter', 'toString', 'trim', 'some', 'forEach', 'includes'].includes(f)))
}

const rows = []
for (const { route, file } of files(API)) {
  const src = fs.readFileSync(file, 'utf8')
  const fileAuth = /authenticateUser|withAuth/.test(src) ? 'helper'
    : /with\w*Permission\(/.test(src) ? 'standup-helper'
    : /cookies\(\)/.test(src) ? 'cookie-only' : 'NONE'
  for (const h of handlers(src)) {
    rows.push({
      route,
      method: h.method,
      auth: /authenticateUser|withAuth/.test(h.body) ? 'helper'
        : /with\w*Permission\(/.test(h.body) ? 'standup-helper'
        : /cookies\(\)/.test(h.body) ? 'cookie-only' : fileAuth,
      query: uniq(all(/searchParams\.get\(\s*['"](\w+)['"]\s*\)/g, h.body)),
      body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(h.method) ? bodyFields(h.body) : [],
      permissions: uniq(all(/Permission\.([A-Z_]+)/g, h.body)),
      rawBodyUpdate: /findByIdAndUpdate\([^,]+,\s*(?:updateData|body|payload)\b|\{\s*\.\.\.(?:updateData|body|payload)\b/.test(h.body),
      pageLimitDefault: (h.body.match(/searchParams\.get\(['"]limit['"]\)\s*\|\|\s*['"](\d+)['"]/) || [])[1] || null,
    })
  }
}
process.stdout.write(JSON.stringify(rows, null, 1))
