import { describe, expect, it } from 'vitest'
import { serverInfo } from '../src/index.js'
import pkg from '../package.json' with { type: 'json' }

describe('package skeleton', () => {
  it('exposes the server name and version', () => {
    expect(serverInfo.name).toBe('kanvaro-mcp-server')
    expect(serverInfo.version).toBe(pkg.version)
  })
})
