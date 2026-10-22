/**
 * Real-transport integration tests for the OpenCode session-identity fix.
 *
 * These tests do not mock the adapter: a real DSH `LlmRuntime` is wired to the
 * published `@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.2` adapter, which drives the
 * real `@earendil-works/pi-ai@1.1.0` OpenCode provider over loopback HTTP. The
 * local server (tests/fixtures/transport/mock-opencode-server.ts) emulates the
 * OpenCode gateway session check and records what actually reached the wire.
 *
 * Covered here:
 * - the four chat protocols pi-ai 1.1.0 routes for `opencode`
 *   (openai-completions, openai-responses, anthropic-messages,
 *   google-generative-ai), driven through the real DSH Auto review path;
 * - the three protocols routed for `opencode-go`;
 * - the upstream-vs-fix comparison: the official auto-review package fails
 *   closed with the gateway's MissingSessionID rejection, this package
 *   delivers the header and executes the tool exactly once;
 * - the unchanged upstream priority rule: an explicitly configured same-name
 *   header (any case) suppresses the auto-generated session header;
 * - the adapter-level bug baseline: the header appears only when
 *   `GenerateOptions.sessionId` is non-empty.
 *
 * Adapted test-harness scaffolding (not production code) follows
 * deepseek-ai/deepseek-harness@687f282e8625c6b8d11ff58211a90524be2e4317,
 * packages/experimental/auto-review/tests/auto-review.spec.ts (MIT).
 *
 * SPDX-License-Identifier: MIT
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-instructions'
import * as UpstreamAutoReview from '@deepseek-ai/dsh-experimental-auto-review'
import LlmRuntime, {
  createMessage,
  createUserMessage,
  ToolCallId,
  type ContentBlock,
  type StreamChunk,
  type ToolSchema,
} from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import PermissionPresetService, {
  AUTO_PRESET,
  type Config as PermissionConfig,
} from '@deepseek-ai/dsh-permission-presets'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-shell'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import ApprovalService, { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import * as AutoReview from '../src/index.ts'
import {
  closeMockGateways,
  OPENCODE_SESSION_HEADER,
  startMockGateway,
} from './fixtures/transport/mock-opencode-server.ts'
import {
  ALLOW_LOW_DECISION,
  DENY_MEDIUM_DECISION,
  eventsForApi,
  type OpenCodeChatApi,
} from './fixtures/transport/opencode-protocol.ts'

/** Environment variable the adapter resolves through the launch environment. */
const TEST_KEY_ENV = 'DSH_TRANSPORT_TEST_OPENCODE_KEY'
/** Throwaway credential value; never a real key, never leaves the process. */
const TEST_KEY = 'transport-test-key'
/** Reviewer route identity used by every transport case. */
const OPENCODE_ROUTE = 'opencode'

const PRESETS = {
  'read-only': { sandbox: 'read-only', approval: 'ask', name: 'Read only' },
  'workspace-write': { sandbox: 'workspace-write', approval: 'ask', name: 'Workspace write' },
  'danger-full-access': { sandbox: 'danger-full-access', approval: 'never', name: 'Full access' },
} satisfies NonNullable<PermissionConfig['presets']>

const PROBE_SCHEMA: ToolSchema = {
  name: 'probe',
  description: 'live probe description',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  },
}

/** The Auto implementation mounted in one harness: this fix or the official baseline. */
type MountAuto = (ctx: Context) => Promise<unknown>

interface HarnessOptions {
  /** Loopback base URL from the mock gateway. */
  readonly baseURL: string
  /** Provider route key; defaults to `opencode`. */
  readonly route?: 'opencode' | 'opencode-go'
  /** Explicit provider headers configured on the deployment profile. */
  readonly headers?: Record<string, string>
  /** Which Auto implementation to mount; defaults to this package's `src`. */
  readonly mountAuto?: MountAuto
}

interface Harness {
  readonly ctx: Context
}

const contexts: Context[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  while (contexts.length > 0) await contexts.pop()!.fiber.dispose()
  await closeMockGateways()
})

beforeEach(() => {
  vi.stubEnv(TEST_KEY_ENV, TEST_KEY)
})

async function harness(options: HarnessOptions): Promise<Harness> {
  const ctx = new Context()
  provideWorkingDirectoryFixture(ctx)
  contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  ctx.provide('shell', {
    sandboxMode: 'workspace-write',
    resolve() { throw new Error('transport tests do not execute shell requests') },
    run() { throw new Error('transport tests do not execute shell requests') },
    start() { throw new Error('transport tests do not execute shell requests') },
  })
  await ctx.plugin(ApprovalService, { policy: 'ask' })
  await ctx.plugin(PermissionPresetService, { presets: PRESETS, defaultPreset: 'workspace-write' })
  const route = options.route ?? OPENCODE_ROUTE
  await ctx.plugin(LlmPiAi, {
    providers: {
      [route]: {
        apiKeyEnv: TEST_KEY_ENV,
        baseURL: options.baseURL,
        transport: 'sse',
        // The gateway rejection is deterministic; disable provider retries so
        // request counts measure the adapter, not a retry loop.
        retryPolicy: { mode: 'normal', maxRetries: 0 },
        ...options.headers === undefined ? {} : { headers: options.headers },
      },
    },
  })
  await (options.mountAuto ?? (async (target: Context) => target.plugin(AutoReview)))(ctx)
  return { ctx }
}

function agentFor(session: Session, provider: string, model: string): Agent {
  return { id: session.id, session, options: { provider, model } } as Agent
}

function autoSession(
  ctx: Context,
  id: string,
  provider: string,
  model: string,
  cwd = '/workspace/project',
): { session: Session; agent: Agent } {
  const session = ctx.sessions.create(SessionId(id), { meta: { cwd } })
  ctx.permissionPresets.set(session, AUTO_PRESET)
  return { session, agent: agentFor(session, provider, model) }
}

function appendHeader(session: Session, provider: string, model: string): void {
  session.append('request/header', {
    header: { config: { provider, model }, tools: [PROBE_SCHEMA] },
    reason: session.requestHeader() === undefined ? 'initial' : 'change',
  })
}

function appendAssistant(session: Session, content: ContentBlock[]): void {
  session.append('step/start', { turn: 1, step: 1 })
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    stream: [],
    message: createMessage({
      role: 'assistant',
      content,
      source: { kind: 'model', provider: OPENCODE_ROUTE, model: 'transport-model' },
    }),
  }, { surfaceOp: 'append' })
}

function appendNativeCall(session: Session, callId: ToolCallId): void {
  session.append('tool/call', { turn: 1, step: 1, callId, name: 'probe', arguments: '{"path":"target"}' })
}

function registerProbe(ctx: Context): { readonly runs: () => number } {
  let runs = 0
  ctx.tools.register(defineContentToolFixture({
    name: 'probe',
    description: 'live probe description',
    parameters: { path: { type: 'string' } },
    async execute() {
      runs += 1
      return [{ type: 'text', text: 'ran' }]
    },
  }))
  return { runs: () => runs }
}

interface PreparedCall {
  readonly result: ReturnType<Context['tools']['execute']>
  readonly session: Session
}

/** Log the session shape Auto review expects for one pending native probe call. */
function preparePendingProbe(
  ctx: Context,
  sessionId: string,
  provider: string,
  model: string,
  approvalPolicy?: 'never',
): PreparedCall {
  const { session, agent } = autoSession(ctx, sessionId, provider, model)
  if (approvalPolicy !== undefined) setApprovalPolicy(session, approvalPolicy)
  const callId = ToolCallId(`transport-call-${sessionId}`)
  appendHeader(session, provider, model)
  appendAssistant(session, [{ type: 'tool-call', id: callId, name: 'probe', arguments: '{"path":"target"}' }])
  appendNativeCall(session, callId)
  return {
    session,
    result: ctx.tools.execute({
      signal: new AbortController().signal,
      callId,
      name: 'probe',
      arguments: { path: 'target' },
      agent,
    }),
  }
}

interface Collected {
  readonly chunks: StreamChunk[]
  readonly finish: StreamChunk | undefined
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<Collected> {
  const chunks: StreamChunk[] = []
  let finish: StreamChunk | undefined
  for await (const chunk of stream) {
    chunks.push(chunk)
    if (chunk.type === 'finish') finish = chunk
  }
  return { chunks, finish }
}

function signalledMessages(model: string): ReturnType<typeof createUserMessage>[] {
  return [createUserMessage({
    content: [{ type: 'text', text: 'Reply with exactly one JSON decision object.' }],
    source: { kind: 'model', provider: OPENCODE_ROUTE, model },
  })]
}

interface ApiCase {
  readonly api: OpenCodeChatApi
  readonly model: string
  /** Path fragment the real protocol SDK appends to the configured base URL. */
  readonly path: string
}

/** The four chat protocols pi-ai 1.1.0 routes for the `opencode` provider. */
const OPENCODE_CASES: ApiCase[] = [
  { api: 'openai-completions', model: 'deepseek-v4-flash', path: '/chat/completions' },
  { api: 'openai-responses', model: 'gpt-5-nano', path: '/responses' },
  { api: 'anthropic-messages', model: 'claude-haiku-4-5', path: '/v1/messages' },
  { api: 'google-generative-ai', model: 'gemini-3-flash', path: ':streamGenerateContent' },
]

/** The three chat protocols pi-ai 1.1.0 routes for the `opencode-go` provider. */
const OPENCODE_GO_CASES: ApiCase[] = [
  { api: 'openai-completions', model: 'deepseek-v4-flash', path: '/chat/completions' },
  { api: 'openai-responses', model: 'gpt-5.6-luna', path: '/responses' },
  { api: 'anthropic-messages', model: 'claude-haiku-5-5', path: '/v1/messages' },
]

/**
 * Assert the gateway observed exactly one reviewer request carrying the
 * pending agent's session id under the documented header name.
 */
function expectDeliveredSession(
  gateway: Awaited<ReturnType<typeof startMockGateway>>,
  session: Session,
  path: string,
): void {
  expect(gateway.requests).toHaveLength(1)
  const request = gateway.requests[0]!
  expect(request.rejected).toBe(false)
  expect(request.session).toBe(String(session.id))
  expect(request.headers[OPENCODE_SESSION_HEADER]).toBe(String(session.id))
  expect(request.url).toContain(path)
  // The reviewer prompt (not an agent request) is what crossed the wire.
  expect(JSON.stringify(request.body)).toContain('REVIEW_POLICY')
}

describe('real pi-ai transport: reviewer session identity', () => {
  it.each(OPENCODE_CASES)('delivers x-opencode-session for opencode $api', async (testCase) => {
    const gateway = await startMockGateway([{ events: eventsForApi(testCase.api, ALLOW_LOW_DECISION) }])
    const { ctx } = await harness({ baseURL: gateway.url })
    const probe = registerProbe(ctx)
    const call = preparePendingProbe(
      ctx,
      `opencode-${testCase.api}`,
      OPENCODE_ROUTE,
      testCase.model,
    )
    const result = await call.result

    expect(result.isError).toBe(false)
    expect(probe.runs()).toBe(1)
    expectDeliveredSession(gateway, call.session, testCase.path)
  })

  it.each(OPENCODE_GO_CASES)('delivers x-opencode-session for opencode-go $api', async (testCase) => {
    const gateway = await startMockGateway([{ events: eventsForApi(testCase.api, ALLOW_LOW_DECISION) }])
    const { ctx } = await harness({ baseURL: gateway.url, route: 'opencode-go' })
    const probe = registerProbe(ctx)
    const call = preparePendingProbe(
      ctx,
      `opencode-go-${testCase.api}`,
      'opencode-go',
      testCase.model,
    )
    const result = await call.result

    expect(result.isError).toBe(false)
    expect(probe.runs()).toBe(1)
    expectDeliveredSession(gateway, call.session, testCase.path)
  })

  it('returns a real deny decision over the same transport without executing the body', async () => {
    const gateway = await startMockGateway([{ events: eventsForApi('openai-completions', DENY_MEDIUM_DECISION) }])
    const { ctx } = await harness({ baseURL: gateway.url })
    const probe = registerProbe(ctx)
    const call = preparePendingProbe(
      ctx,
      'transport-deny',
      OPENCODE_ROUTE,
      'deepseek-v4-flash',
      'never',
    )
    const result = await call.result

    expect(result.isError).toBe(true)
    expect(probe.runs()).toBe(0)
    expect(gateway.requests).toHaveLength(1)
    const request = gateway.requests[0]!
    expect(request.rejected).toBe(false)
    expect(request.session).toBe(String(call.session.id))
    expect(result.error?.info).toMatchObject({
      name: 'AutoReviewDeniedError',
      code: 'AUTO_REVIEW_DENIED',
      reason: 'not authorized',
    })
  })
})

interface FixPathGatewayErrorCase {
  readonly label: string
  readonly status: number
  readonly body: string
  /** Upstream failure detail the surfaced Auto review error must carry. */
  readonly failure: RegExp
}

/**
 * Real gateway HTTP errors served AFTER the fixed request carried the correct
 * session header. A technical reviewer failure is not a parsed allow/deny
 * decision: the fix must keep failing closed and never execute the tool body.
 */
const FIX_PATH_GATEWAY_ERRORS: FixPathGatewayErrorCase[] = [
  {
    label: 'a gateway MissingSessionID rejection',
    status: 400,
    body: JSON.stringify({ error: { message: 'Missing session ID', code: 'MissingSessionID' } }),
    failure: /MissingSessionID|Missing session ID/,
  },
  {
    label: 'a generic provider HTTP 500',
    status: 500,
    body: JSON.stringify({ error: { message: 'mock gateway exploded', code: 'INTERNAL' } }),
    failure: /mock gateway exploded/,
  },
]

describe('fix path fails closed on a real gateway HTTP error after delivering the header', () => {
  it.each(FIX_PATH_GATEWAY_ERRORS)('keeps the tool body unexecuted on $label', async (testCase) => {
    const gateway = await startMockGateway([{ status: testCase.status, body: testCase.body }])
    const { ctx } = await harness({ baseURL: gateway.url })
    const probe = registerProbe(ctx)
    const call = preparePendingProbe(
      ctx,
      `fix-gateway-error-${testCase.status}`,
      OPENCODE_ROUTE,
      'deepseek-v4-flash',
    )
    const result = await call.result

    // Unambiguously the fixed path: the reviewer request carried the pending
    // agent's session id, so the gateway consumed the scripted error reply
    // instead of its own missing-session rejection.
    expect(gateway.requests).toHaveLength(1)
    const request = gateway.requests[0]!
    expect(request.rejected).toBe(false)
    expect(request.session).toBe(String(call.session.id))
    expect(request.headers[OPENCODE_SESSION_HEADER]).toBe(String(call.session.id))

    // The reviewer failed technically: fail closed, not a final Auto decision.
    expect(result.isError).toBe(true)
    expect(result.error?.info).toBeUndefined()
    expect(probe.runs()).toBe(0)
    const message = result.error?.message ?? ''
    expect(message.startsWith('Auto review of tool "probe" failed; its body was not executed: ')).toBe(true)
    expect(message).toContain('auto-review: reviewer ended with error')
    expect(message).toMatch(testCase.failure)
    expect(message).toContain(String(testCase.status))
  })
})

describe('upstream official implementation vs this fix over the same fixture', () => {
  it('official fails closed with MissingSessionID; the fix delivers the header and executes once', async () => {
    const gateway = await startMockGateway([{ events: eventsForApi('openai-completions', ALLOW_LOW_DECISION) }])

    // 1. The official 0.2.1-rc.2 package built the same frozen request without
    //    sessionId, so pi-ai emits no session header and the gateway rejects.
    const official = await harness({
      baseURL: gateway.url,
      mountAuto: async (ctx: Context) => ctx.plugin(UpstreamAutoReview),
    })
    const officialProbe = registerProbe(official.ctx)
    const officialCall = preparePendingProbe(
      official.ctx,
      'official-missing-session',
      OPENCODE_ROUTE,
      'deepseek-v4-flash',
    )
    const officialResult = await officialCall.result
    expect(officialResult.isError).toBe(true)
    expect(officialProbe.runs()).toBe(0)
    expect(gateway.requests).toHaveLength(1)
    const rejected = gateway.requests[0]!
    expect(rejected.session).toBeUndefined()
    expect(rejected.headers[OPENCODE_SESSION_HEADER]).toBeUndefined()
    expect(rejected.rejected).toBe(true)
    const rejection = officialResult.error?.message ?? ''

    expect(rejection).toContain('Auto review of tool "probe" failed; its body was not executed')
    expect(rejection).toMatch(/MissingSessionID|Missing session ID/)
    expect(rejection).toMatch(/400/)

    // 2. This package freezes sessionId into the same request, so the gateway
    //    accepts it and the parsed allow decision executes the tool exactly once.
    const fixed = await harness({ baseURL: gateway.url })
    const fixedProbe = registerProbe(fixed.ctx)
    const fixedCall = preparePendingProbe(
      fixed.ctx,
      'fix-delivers-session',
      OPENCODE_ROUTE,
      'deepseek-v4-flash',
    )
    const fixedResult = await fixedCall.result
    expect(fixedResult.isError).toBe(false)
    expect(fixedProbe.runs()).toBe(1)
    expect(gateway.requests).toHaveLength(2)
    const fixRequest = gateway.requests[1]!

    expect(fixRequest.session).toBe(String(fixedCall.session.id))
    expect(gateway.requests[1]!.headers[OPENCODE_SESSION_HEADER]).toBe(String(fixedCall.session.id))
    expect(gateway.requests[1]!.rejected).toBe(false)
  })
})

describe('unchanged upstream priority: an explicit same-name header wins', () => {
  it.each([
    ['lower-case key', 'x-opencode-session'],
    ['mixed-case key', 'X-OpenCode-Session'],
  ])('suppresses the generated session header with an explicitly configured %s', async (_label, headerName) => {
    const configured = 'deployment-static-session'
    const gateway = await startMockGateway([{ events: eventsForApi('openai-completions', ALLOW_LOW_DECISION) }])
    const { ctx } = await harness({
      baseURL: gateway.url,
      headers: { [headerName]: configured },
    })
    const probe = registerProbe(ctx)
    const call = preparePendingProbe(
      ctx,
      `explicit-header-${headerName.toLowerCase()}`,
      OPENCODE_ROUTE,
      'deepseek-v4-flash',
    )
    const result = await call.result

    expect(result.isError).toBe(false)
    expect(probe.runs()).toBe(1)
    expect(gateway.requests).toHaveLength(1)
    const request = gateway.requests[0]!
    // The explicitly configured header is what crossed the wire; pi-ai did not
    // add or overwrite it with the agent session id.
    expect(request.session).toBe(configured)
    expect(request.headers[OPENCODE_SESSION_HEADER]).toBe(configured)
    expect(request.session).not.toBe(String(call.session.id))
  })
})

describe('adapter-level bug baseline: GenerateOptions.sessionId drives the header', () => {
  it('present when sessionId is set, absent when it is omitted or empty', async () => {
    const gateway = await startMockGateway([
      { events: eventsForApi('openai-completions', ALLOW_LOW_DECISION) },
    ])
    const { ctx } = await harness({
      baseURL: gateway.url,
      mountAuto: async () => Promise.resolve(),
    })
    const model = 'deepseek-v4-flash'

    const withSession = await collect(ctx.llm.stream({
      provider: OPENCODE_ROUTE,
      model,
      messages: signalledMessages(model),
      sessionId: SessionId('adapter-session-id'),
    }))
    expect(withSession.finish).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })

    const withoutSession = await collect(ctx.llm.stream({
      provider: OPENCODE_ROUTE,
      model,
      messages: signalledMessages(model),
    }))
    expect(withoutSession.finish).toMatchObject({ type: 'finish', reason: { kind: 'error' } })

    const emptySession = await collect(ctx.llm.stream({
      provider: OPENCODE_ROUTE,
      model,
      messages: signalledMessages(model),
      sessionId: SessionId(''),
    }))
    expect(emptySession.finish).toMatchObject({ type: 'finish', reason: { kind: 'error' } })

    expect(gateway.requests).toHaveLength(3)

    expect(gateway.requests[0]!.session).toBe('adapter-session-id')
    expect(gateway.requests[0]!.headers[OPENCODE_SESSION_HEADER]).toBe('adapter-session-id')
    expect(gateway.requests[0]!.rejected).toBe(false)
    expect(gateway.requests[1]!.session).toBeUndefined()
    expect(gateway.requests[1]!.rejected).toBe(true)
    expect(gateway.requests[2]!.session).toBeUndefined()
    expect(gateway.requests[2]!.rejected).toBe(true)

    // The rejection is surfaced as the gateway's HTTP 400 failure, not a silent
    // empty review: this is the bug baseline the fix removes.
    const failure = withoutSession.finish
    if (failure?.type !== 'finish' || failure.reason.kind !== 'error') throw new Error('expected an error finish')
    expect(failure.reason.failure.message).toMatch(/MissingSessionID|Missing session ID|400/)
  })
})
