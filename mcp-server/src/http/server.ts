/**
 * HTTP server lifecycle (task 1.7): listen with sane timeouts, and close gracefully —
 * stop accepting connections, let running requests finish, then force-close after a
 * grace period.
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Express } from 'express'

export interface RunningServer {
  /** e.g. http://127.0.0.1:3100 */
  url: string
  port: number
  /** Stops accepting, waits for running requests (up to graceMs), then closes the rest. */
  close(graceMs?: number): Promise<void>
}

/**
 * Ports that fetch() refuses to connect to (WHATWG Fetch "bad ports"). When a server asks
 * for any free port (port 0), Windows may hand out one of these; we then pick again.
 */
export const FETCH_BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111,
  113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548,
  554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566,
  6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
])

/** Listens on `port`; for port 0, retries until the assigned port is one fetch() accepts. */
export async function listenSafely(server: Server, port: number, host: string): Promise<AddressInfo> {
  for (let attempt = 0; ; attempt++) {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => {
        server.off('error', reject)
        resolve()
      })
    })
    const address = server.address() as AddressInfo
    if (port !== 0 || !FETCH_BAD_PORTS.has(address.port) || attempt >= 10) return address
    await new Promise<void>(r => server.close(() => r()))
  }
}

export async function startServer(app: Express, host: string, port: number): Promise<RunningServer> {
  const server = createServer(app)
  server.requestTimeout = 30_000 // a whole request
  server.headersTimeout = 15_000 // slow-header clients
  server.keepAliveTimeout = 5_000

  const address = await listenSafely(server, port, host)
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
