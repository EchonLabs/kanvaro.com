// Runs vitest with a normalised working directory.
//
// On Windows, some shells (Git Bash, VS Code terminals) report the current directory with
// a lower-case drive letter ("d:\..."). Node then loads vitest twice — once as "d:\..."
// and once as "D:\..." — and tests fail inside vitest with
// "Cannot read properties of undefined (reading 'config')". Upper-casing the drive letter
// avoids it. On other platforms this is a plain pass-through.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const cwd = process.cwd().replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`)
const require = createRequire(path.join(cwd, 'package.json'))
const cli = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs')

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { cwd, stdio: 'inherit' })
process.exit(result.status ?? 1)
