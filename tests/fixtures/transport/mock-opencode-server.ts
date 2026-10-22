/**
 * Local 127.0.0.1 HTTP stand-in for the OpenCode gateway.
 *
 * Adapted from the target baseline's
 * `packages/llm/llm-pi-ai/tests/mock-server.ts`
 * (deepseek-ai/deepseek-harness commit 687f282e8625c6b8d11ff58211a90524be2e4317, MIT).
 *
 * Difference from the upstream helper: this one emulates the gateway's session
 * check. A request that does not carry a non-empty `x-opencode-session` header
 * is answered with the real gateway's failure shape (HTTP 400,
 * `MissingSessionID`) instead of a scripted response, so the missing-header
 * bug reproduces end to end through the published adapter instead of being
 * simulated. Scripted behaviors are only consumed by requests that pass the
 * check.
 *
 * The server never leaves the loopback interface and records every request
 * (URL, headers, parsed body) so tests can assert on what actually reached the
 * wire.
 */
import { createServer } from 'node:http'
import { zstdDecompressSync } from 'node:zlib'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

/** Header the OpenCode gateway requires on every chat request. */
export const OPENCODE_SESSION_HEADER = 'x-opencode-session'

/** One SSE frame: a bare `data:` line, or a named `event:` + `data:` pair. */
export type SseFrame = string | { readonly event: string; readonly data: string }

/** One scripted reply for a request that passes the gateway session check. */
export interface GatewayBehavior {
  /** Non-200 status for a JSON error reply. */
  readonly status?: number
  /** Raw body for a plain JSON reply. */
  readonly body?: string
  /** SSE frames for a `text/event-stream` reply; mutually exclusive with `body`. */
  readonly events?: readonly SseFrame[]
}

/** Gateway emulation switches. */
export interface GatewayOptions {
  /** Reject requests without the session header; defaults to `true`. */
  readonly requireSession?: boolean
  /** Header name the emulated gateway requires; defaults to {@link OPENCODE_SESSION_HEADER}. */
  readonly headerName?: string
}

/** One request as the local server observed it. */
export interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly headers: IncomingMessage['headers']
  readonly body: unknown
  /** Trimmed session header value, or `undefined` when absent. */
  readonly session: string | undefined
  /** Whether the gateway emulation rejected this request for a missing session. */
  readonly rejected: boolean
}

/** A running local gateway stand-in. */
export interface MockGateway {
  /** Base URL, e.g. `http://127.0.0.1:53124`. */
  readonly url: string
  /** Every request received, in arrival order. */
  readonly requests: RecordedRequest[]
  /** Request paths, in arrival order. */
  readonly paths: string[]
  /** Number of responses whose socket closed. */
  readonly closedResponses: number
  /** Stop listening and drop open connections. */
  close(): Promise<void>
}

const gateways: Server[] = []

/** Close every listener opened by {@link startMockGateway}; safe to call repeatedly. */
export async function closeMockGateways(): Promise<void> {
  await Promise.all(gateways.splice(0).map(server => new Promise<void>((resolve) => {
    server.close(() => { resolve() })
    server.closeAllConnections()
  })))
}

/**
 * Start a loopback HTTP server that plays the OpenCode gateway.
 * @param script - scripted replies consumed by requests that pass the session check.
 * @param options - gateway emulation switches.
 * @returns the running gateway, with its recorded requests.
 */
export async function startMockGateway(
  script: GatewayBehavior[],
  options: GatewayOptions = {},
): Promise<MockGateway> {
  const headerName = options.headerName ?? OPENCODE_SESSION_HEADER
  const requireSession = options.requireSession !== false
  const requests: RecordedRequest[] = []
  const paths: string[] = []
  let closedResponses = 0
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    response.on('close', () => { closedResponses += 1 })
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const bytes = Buffer.concat(chunks)
      // Codex SSE requests may arrive zstd-compressed; harmless for JSON bodies.
      const decoded = request.headers['content-encoding'] === 'zstd' ? zstdDecompressSync(bytes) : bytes
      const text = decoded.toString('utf8')
      let body: unknown
      if (text.length > 0) {
        try {
          body = JSON.parse(text) as unknown
        } catch {
          body = text
        }
      }
      const rawSession = request.headers[headerName]
      const session = (Array.isArray(rawSession) ? rawSession.join(',') : rawSession)?.trim()
      const path = request.url ?? ''
      paths.push(path)
      const rejected = requireSession && (session === undefined || session.length === 0)
      requests.push({ method: request.method ?? '', url: path, headers: request.headers, body, session, rejected })
      if (rejected) {
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          error: { message: 'Missing session ID', code: 'MissingSessionID' },
        }))
        return
      }
      const behavior = script.shift()
      if (behavior === undefined) {
        response.writeHead(500, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: 'mock gateway script exhausted' } }))
        return
      }
      if (behavior.status !== undefined && behavior.status !== 200) {
        response.writeHead(behavior.status, { 'content-type': 'application/json' })
        response.end(behavior.body ?? '{}')
        return
      }
      if (behavior.body !== undefined) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(behavior.body)
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.flushHeaders()
      for (const frame of behavior.events ?? []) {
        response.write(typeof frame === 'string' ? `data: ${frame}\n\n` : `event: ${frame.event}\ndata: ${frame.data}\n\n`)
      }
      response.end()
    })
  })
  gateways.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock gateway has no TCP port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    paths,
    get closedResponses() { return closedResponses },
    close(): Promise<void> {
      return new Promise<void>((resolve) => {
        server.close(() => { resolve() })
        server.closeAllConnections()
      })
    },
  }
}
