// OAuth/MCP probe for task 0.3 — records exactly what Claude Code sends.
// Plain Node, no dependencies. NOT production code.
//
//   MODE=all  advertise CIMD + dynamic registration (default)
//   MODE=dcr  advertise dynamic registration only
//   MODE=cimd advertise CIMD only
//   PORT=8790 ACCESS_TTL=30 (seconds, short so refresh is exercised)
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.PORT || 8790)
const MODE = process.env.MODE || 'all'
const ACCESS_TTL = Number(process.env.ACCESS_TTL || 30)
const BASE = `http://localhost:${PORT}`
const RESOURCE = `${BASE}/mcp`
const LOG = process.env.LOG || path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), `log-${MODE}.jsonl`)

const clients = new Map()   // client_id -> { redirect_uris, source }
const codes = new Map()     // code -> { client_id, redirect_uri, challenge, method, resource, scope }
const access = new Map()    // token -> { exp, resource, client_id }
const refresh = new Map()   // token -> { client_id, resource, scope }

const rnd = () => crypto.randomBytes(24).toString('base64url')
const s256 = v => crypto.createHash('sha256').update(v).digest('base64url')
const mask = v => (typeof v === 'string' && v.length > 10 ? v.slice(0, 6) + '…' : v)

function log(event, data) {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...data })
  fs.appendFileSync(LOG, line + '\n')
  console.log(line)
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body === 'object'
  res.writeHead(status, { 'Content-Type': isJson ? 'application/json' : 'text/plain', ...headers })
  res.end(isJson ? JSON.stringify(body) : body ?? '')
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

const prm = {
  resource: RESOURCE,
  authorization_servers: [BASE],
  scopes_supported: ['kanvaro'],
  bearer_methods_supported: ['header'],
}

const asMeta = {
  issuer: BASE,
  authorization_endpoint: `${BASE}/authorize`,
  token_endpoint: `${BASE}/token`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ['kanvaro'],
  authorization_response_iss_parameter_supported: true,
  ...(MODE !== 'dcr' ? { client_id_metadata_document_supported: true } : {}),
  ...(MODE !== 'cimd' ? { registration_endpoint: `${BASE}/register` } : {}),
}

function isLoopbackPortOnlyDiff(registered, requested) {
  try {
    const a = new URL(registered), b = new URL(requested)
    const loop = h => ['localhost', '127.0.0.1', '[::1]'].includes(h)
    return loop(a.hostname) && a.hostname === b.hostname && a.protocol === b.protocol &&
      a.pathname === b.pathname && a.search === b.search
  } catch { return false }
}

async function fetchCimd(clientId) {
  // Probe only: real server must also block private addresses, cap size, no redirects.
  const r = await fetch(clientId, { headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(5000) })
  const text = await r.text()
  log('cimd.fetch', { clientId, status: r.status, bytes: text.length, body: text.slice(0, 5000) })
  if (r.status !== 200) throw new Error('cimd status ' + r.status)
  const doc = JSON.parse(text)
  if (doc.client_id !== clientId) throw new Error('client_id mismatch')
  return doc
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE)
  const p = url.pathname
  try {
    // ---- discovery ----
    if (req.method === 'GET' && p.startsWith('/.well-known/')) {
      log('discovery', { path: p, ua: req.headers['user-agent'] })
      if (p.startsWith('/.well-known/oauth-protected-resource')) return send(res, 200, prm)
      if (p.startsWith('/.well-known/oauth-authorization-server') || p.startsWith('/.well-known/openid-configuration')) return send(res, 200, asMeta)
      return send(res, 404, { error: 'not_found' })
    }

    // ---- dynamic registration ----
    if (req.method === 'POST' && p === '/register') {
      if (MODE === 'cimd') return send(res, 404, { error: 'not_found' })
      const body = JSON.parse((await readBody(req)) || '{}')
      log('register', { body })
      const client_id = 'dcr-' + rnd()
      clients.set(client_id, { redirect_uris: body.redirect_uris || [], source: 'dcr' })
      return send(res, 201, { client_id, ...body, token_endpoint_auth_method: 'none' })
    }

    // ---- authorize (auto-approve) ----
    if (req.method === 'GET' && p === '/authorize') {
      const q = Object.fromEntries(url.searchParams)
      log('authorize', { query: { ...q, code_challenge: mask(q.code_challenge), state: mask(q.state) } })
      let client = clients.get(q.client_id)
      if (!client && /^https:\/\//.test(q.client_id || '')) {
        const doc = await fetchCimd(q.client_id)
        client = { redirect_uris: doc.redirect_uris || [], source: 'cimd' }
        clients.set(q.client_id, client)
      }
      if (!client) {
        // pre-registered test client: accept and record
        client = { redirect_uris: [q.redirect_uri], source: 'preregistered' }
        clients.set(q.client_id, client)
      }
      const exact = client.redirect_uris.includes(q.redirect_uri)
      const portOnly = !exact && client.redirect_uris.some(r => isLoopbackPortOnlyDiff(r, q.redirect_uri))
      log('authorize.redirect_check', { source: client.source, registered: client.redirect_uris, requested: q.redirect_uri, exact, loopbackPortOnlyDiff: portOnly })
      if (!exact && !portOnly) return send(res, 400, 'redirect_uri not registered — no redirect (correct behaviour)')
      if (q.code_challenge_method !== 'S256') return send(res, 400, 'S256 required')
      const code = rnd()
      codes.set(code, { client_id: q.client_id, redirect_uri: q.redirect_uri, challenge: q.code_challenge, resource: q.resource, scope: q.scope, exp: Date.now() + 60000 })
      const to = new URL(q.redirect_uri)
      to.searchParams.set('code', code)
      if (q.state) to.searchParams.set('state', q.state)
      to.searchParams.set('iss', BASE)
      res.writeHead(302, { Location: to.toString() })
      return res.end()
    }

    // ---- token ----
    if (req.method === 'POST' && p === '/token') {
      const raw = await readBody(req)
      const f = Object.fromEntries(new URLSearchParams(raw))
      log('token', { contentType: req.headers['content-type'], hasAuthHeader: !!req.headers.authorization, form: { ...f, code: mask(f.code), code_verifier: mask(f.code_verifier), refresh_token: mask(f.refresh_token) } })
      if (f.grant_type === 'authorization_code') {
        const c = codes.get(f.code); codes.delete(f.code)
        if (!c || c.exp < Date.now()) return send(res, 400, { error: 'invalid_grant' })
        const checks = { clientMatch: c.client_id === f.client_id, redirectMatch: c.redirect_uri === f.redirect_uri, pkce: s256(f.code_verifier || '') === c.challenge, resourceInAuthorize: c.resource, resourceInToken: f.resource }
        log('token.checks', checks)
        if (!checks.pkce || !checks.redirectMatch) return send(res, 400, { error: 'invalid_grant' })
        return issue(res, f.client_id, f.resource || c.resource, c.scope)
      }
      if (f.grant_type === 'refresh_token') {
        const r = refresh.get(f.refresh_token); refresh.delete(f.refresh_token) // rotation
        log('token.refresh', { known: !!r, resourceInRefresh: f.resource })
        if (!r) return send(res, 400, { error: 'invalid_grant' })
        return issue(res, r.client_id, r.resource, r.scope)
      }
      return send(res, 400, { error: 'unsupported_grant_type' })
    }

    // ---- MCP endpoint ----
    if (p === '/mcp') {
      if (req.method !== 'POST') { log('mcp.method', { method: req.method }); return send(res, 405, '') }
      const auth = req.headers.authorization || ''
      const tok = auth.startsWith('Bearer ') ? auth.slice(7) : null
      const a = tok && access.get(tok)
      const body = await readBody(req)
      let msg = {}; try { msg = JSON.parse(body) } catch {}
      log('mcp.request', {
        rpcMethod: msg.method, hasToken: !!tok, tokenValid: !!(a && a.exp > Date.now()),
        headers: pick(req.headers, ['mcp-protocol-version', 'mcp-method', 'mcp-name', 'mcp-session-id', 'origin', 'accept', 'user-agent']),
        meta: msg.params?._meta,
      })
      if (!a || a.exp < Date.now()) {
        return send(res, 401, { error: 'invalid_token' }, { 'WWW-Authenticate': `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp", scope="kanvaro"` })
      }
      if (msg.id === undefined) return send(res, 202, '')
      const result = rpc(msg)
      return send(res, result.error ? 200 : 200, { jsonrpc: '2.0', id: msg.id, ...result })
    }

    log('unhandled', { method: req.method, path: p })
    send(res, 404, { error: 'not_found' })
  } catch (e) {
    log('error', { path: p, message: String(e.message || e) })
    send(res, 400, { error: 'invalid_request', error_description: String(e.message || e) })
  }
})

function issue(res, client_id, resource, scope) {
  const at = rnd(), rt = rnd()
  access.set(at, { exp: Date.now() + ACCESS_TTL * 1000, resource, client_id })
  refresh.set(rt, { client_id, resource, scope })
  log('token.issued', { client_id: mask(client_id), audience: resource, expires_in: ACCESS_TTL })
  return send(res, 200, { access_token: at, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: rt, scope: scope || 'kanvaro' })
}

function rpc(msg) {
  switch (msg.method) {
    case 'initialize':
      return { result: { protocolVersion: msg.params?.protocolVersion || '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'kanvaro-probe', version: '0.0.1' } } }
    case 'tools/list':
      return { result: { tools: [{ name: 'whoami', description: 'Probe tool', inputSchema: { type: 'object', properties: {} } }] } }
    case 'tools/call':
      return { result: { content: [{ type: 'text', text: 'probe ok' }] } }
    case 'ping':
      return { result: {} }
    default:
      return { error: { code: -32601, message: 'Method not found' } }
  }
}

function pick(o, keys) { return Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]])) }

server.listen(PORT, '127.0.0.1', () => console.log(`probe MODE=${MODE} on ${BASE} → ${LOG}`))
// Also answer on IPv6 loopback, since "localhost" may resolve to ::1 first.
http.createServer(server.listeners('request')[0]).listen(PORT, '::1').on('error', () => {})
