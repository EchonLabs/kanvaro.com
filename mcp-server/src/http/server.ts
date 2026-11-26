/**
 * HTTP server lifecycle (task 1.7): listen with sane timeouts, and close gracefully —
 * stop accepting connections, let running requests finish, then force-close after a
 * grace period.
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Express } from 'express'

export interface RunningServer {
  /** e.g. http://127.0.0.1:3100 */
  url: string
  port: number
  /** Stops accepting, waits for running requests (up to graceMs), then closes the rest. */
  close(graceMs?: number): Promise<void>
}

export async function startServer(app: Express, host: string, port: number): Promise<RunningServer> {
  const server = createServer(app)
  server.requestTimeout = 30_000 // a whole request
  server.headersTimeout = 15_000 // slow-header clients
  server.keepAliveTimeout = 5_000

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address() as AddressInfo
  const shownHost = address.family === 'IPv6' ? `[${address.address}]` : address.address

  let closing: Promise<void> | undefined
  return {
    url: `http://${shownHost}:${address.port}`,
    port: address.port,
    close(graceMs = 10_000) {
      closing ??= new Promise<void>(resolve => {
        const force = setTimeout(() => server.closeAllConnections(), graceMs)
        force.unref()
        server.close(() => {
          clearTimeout(force)
          resolve()
        })
        server.closeIdleConnections()
      })
      return closing
    },
  }
}
