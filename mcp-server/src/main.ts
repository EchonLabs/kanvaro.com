/**
 * Process entry point. Loads configuration first; if anything required is missing or
 * invalid the process exits with code 1 and a list of the problems (no secret values).
 *
 * Later tasks add the database (1.3), logging (1.6) and the HTTP/MCP server (1.7, 1.8).
 */
import { ConfigError, describeConfig, loadConfig } from './config.js'
import { serverInfo } from './index.js'

function main(): void {
  let config
  try {
    config = loadConfig()
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`${serverInfo.name}: cannot start.\n${err.message}`)
      process.exit(1)
    }
    throw err
  }
  // Temporary until the logging module (task 1.6) exists.
  process.stdout.write(`${JSON.stringify({ msg: 'configuration loaded', server: serverInfo, config: describeConfig(config) })}\n`)
}

main()
