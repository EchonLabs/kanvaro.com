// 0. Load env vars from .env.local (Next.js doesn't auto-load these outside the framework)
require('dotenv').config({ path: '.env.local' })

// 1. Patch module loader FIRST — makes server-only a no-op in Node.js context
const Module = require('module')
const orig = Module._load
Module._load = function (request, ...args) {
  if (request === 'server-only') return {}
  return orig.call(this, request, ...args)
}

// 2. Register tsx so .ts files can be required
require('tsx/cjs')

// 3. Load the worker
require('../src/worker.ts')
