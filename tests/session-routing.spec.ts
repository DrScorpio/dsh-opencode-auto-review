/**
 * Session-identity routing matrix for the derived Auto review plugin.
 *
 * DEVELOPMENT.md sections 3.2 and 6.2 require that every reviewer request carries
 * the identity of the Agent whose pending tool call is being reviewed:
 *
 * - a single native call -> the reviewed Agent's own `session.id`;
 * - two concurrent Auto sessions -> each review keeps its own id (barrier above);
 * - an in-process subagent child -> the child's id, never the parent's;
 * - a started PTC inner call -> the owning session's id while the outer
 *   `run_code` transport stays excluded;
 * - approval (`ask` vs `never`), technical failure, and caller cancellation ->
 *   the identity is attached and a non-allow outcome never executes the body.
 *
 * The harness is the same offline recording-adapter style as
 * `tests/auto-review.spec.ts` (which is ported from upstream): a
 * `RecordingAdapter` captures the frozen `GenerateOptions` before scripted
 * decisions are yielded; `Context`, `LlmRuntime`, `SessionStore`, `ToolRuntime`,
 * `PermissionPresetService`, and `ApprovalService` are mounted on a throwaway
 * Context; sessions are created with `SessionId` and driven through the public
 * `session.append` event helpers. Nothing here needs a network, credentials, or
 * wall-clock timing; every synchronization point is an explicit deferred.
 *
 * Every case routes through the ordinary `review` provider: the derived plugin
 * has no provider-specific branch, so a non-OpenCode route exercises the same
 * code path that would attach `x-opencode-session` on an OpenCode route.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LlmRuntime, {
  createMessage,
  createUserMessage,
  LlmAdapter,
  ToolCallId,
  type ContentBlock,
  type GenerateOptions,
  type StreamChunk,
  type ToolSchema,
} from '@deepseek-ai/dsh-llm'
import PermissionPresetService, {
  AUTO_PRESET,
  type Config as PermissionConfig,
} from '@deepseek-ai/dsh-permission-presets'
import SessionStore, {
  SessionId,
  type Session,
} from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-shell'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, {
  defineContentToolFixture,
  RUN_CODE_NAME,
  TOOL_ABORTED_BEFORE_DISPATCH,
  type ToolExecutionToken,
} from '@deepseek-ai/dsh-tools'
import ApprovalService, { setApprovalPolicy, type ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import * as AutoReview from '../src/index.ts'

type ReviewScript = readonly StreamChunk[] | ((options: GenerateOptions) => AsyncIterable<StreamChunk>)

/** Records the exact frozen request each review sends, then plays one script entry. */
class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly script: ReviewScript[]) {
    super()
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const response = this.script.shift()
    if (response === undefined) throw new Error('review adapter script exhausted')
    if (typeof response === 'function') {
      yield* response(options)
      return
    }
    for (const chunk of response) yield chunk
  }
}

interface PluginFiber {
  dispose(): Promise<void>
}

const PRESETS = {
  'read-only': { sandbox: 'read-only', approval: 'ask', name: 'Read only' },
  'workspace-write': { sandbox: 'workspace-write', approval: 'ask', name: 'Workspace write' },
  'danger-full-access': { sandbox: 'danger-full-access', approval: 'never', name: 'Full access' },
} satisfies NonNullable<PermissionConfig['presets']>

const contexts: Context[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  while (contexts.length > 0) await contexts.pop()!.fiber.dispose()
})

/** One well-formed allow decision stream for the reviewed call. */
function decisionChunks(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

async function harness(
  script: ReviewScript[],
  permissionConfig: NonNullable<Parameters<typeof PermissionPresetService.Config>[0]> = { presets: PRESETS, defaultPreset: 'workspace-write' },
): Promise<{ ctx: Context; adapter: RecordingAdapter; auto: PluginFiber }> {
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
    resolve() { throw new Error('session-routing tests do not execute shell requests') },
    run() { throw new Error('session-routing tests do not execute shell requests') },
    start() { throw new Error('session-routing tests do not execute shell requests') },
  })
  await ctx.plugin(ApprovalService, { policy: 'ask' })
  await ctx.plugin(PermissionPresetService, permissionConfig)
  const adapter = new RecordingAdapter(script)
  ctx.llm.registerAdapter(['review'], adapter)
  const auto = await ctx.plugin(AutoReview)
  return { ctx, adapter, auto }
}

function agentFor(session: Session): Agent {
  return {
    id: session.id,
    session,
    options: { provider: 'review', model: 'same-model' },
  } as Agent
}

function autoSession(ctx: Context, id: string, cwd = '/workspace'): { session: Session; agent: Agent } {
  const session = ctx.sessions.create(SessionId(id), { meta: { cwd } })
  ctx.permissionPresets.set(session, AUTO_PRESET)
  return { session, agent: agentFor(session) }
}

function appendHeader(
  session: Session,
  tools?: readonly ToolSchema[],
  config: { provider: string; model: string } = { provider: 'review', model: 'same-model' },
): void {
  session.append('request/header', {
    header: { config, ...tools === undefined ? {} : { tools: [...tools] } },
    reason: session.requestHeader() === undefined ? 'initial' : 'change',
  })
}

function appendUser(session: Session, text: string, source: Parameters<typeof createUserMessage>[0]['source']): void {
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text }],
    source,
  }), { surfaceOp: 'append' })
}

function appendAssistant(
  session: Session,
  content: ContentBlock[],
  turn = 1,
  step = 1,
): void {
  session.append('step/start', { turn, step })
  session.append('assistant/message', {
    turn,
    step,
    stream: [],
    message: createMessage({
      role: 'assistant',
      content,
      source: { kind: 'model', provider: 'review', model: 'same-model' },
    }),
  }, { surfaceOp: 'append' })
}

function appendNativeCall(
  session: Session,
  callId: ToolCallId,
  name: string,
  rawArguments: string,
  turn = 1,
  step = 1,
): void {
  session.append('tool/call', { turn, step, callId, name, arguments: rawArguments })
}

function registerProbe(ctx: Context, name = 'probe'): { readonly runs: () => number } {
  let runs = 0
  ctx.tools.register(defineContentToolFixture({
    name,
    description: `live ${name} description`,
    parameters: { path: { type: 'string' } },
    async execute() {
      runs += 1
      return [{ type: 'text', text: 'ran' }]
    },
  }))
  return { runs: () => runs }
}

/** Decode the four data sections from one recorded review request. */
function requestSections(request: GenerateOptions): Record<string, unknown> {
  const block = request.messages[0]?.content[0]
  if (block?.type !== 'text') throw new Error('review request has no text body')
  const labels = ['ENVIRONMENT', 'PROJECT_INSTRUCTIONS', 'FILTERED_HISTORY', 'PENDING_ACTION'] as const
  const sections: Record<string, unknown> = {}
  for (const [index, label] of labels.entries()) {
    const prefix = `${label}\n`
    const start = block.text.indexOf(prefix)
    if (start < 0) throw new Error(`missing ${label}`)
    const nextLabel = labels[index + 1]
    const end = nextLabel === undefined ? block.text.length : block.text.indexOf(`\n\n${nextLabel}\n`, start)
    sections[label] = JSON.parse(block.text.slice(start + prefix.length, end)) as unknown
  }
  return sections
}

/** Run one reviewed native call whose logged facts match the execution. */
async function executeReviewedNative(
  ctx: Context,
  session: Session,
  agent: Agent,
  id: string,
  rawArguments = '{}',
  args: unknown = {},
): Promise<Awaited<ReturnType<Context['tools']['execute']>>> {
  const callId = ToolCallId(`${id}-call`)
  appendAssistant(session, [{ type: 'tool-call', id: callId, name: 'probe', arguments: rawArguments }])
  appendNativeCall(session, callId, 'probe', rawArguments)
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId,
    name: 'probe',
    arguments: args,
    agent,
  })
}

describe('reviewer request session identity', () => {
  it('uses the reviewed Agent session id for one native call and runs the body once after allow', async () => {
    const { ctx, adapter } = await harness([decisionChunks('{"risk":"low","decision":"allow"}')])
    const probe = registerProbe(ctx)
    const { session, agent } = autoSession(ctx, 'routing-single')
    appendHeader(session, [{ name: 'probe', description: 'probe', parameters: { type: 'object' } }])
    appendUser(session, 'Run the probe once.', { kind: 'user', rpcId: 'single-call-rpc' } as never)

    const result = await executeReviewedNative(ctx, session, agent, 'routing-single')

    expect(result.isError).toBe(false)
    expect(probe.runs()).toBe(1)
    expect(adapter.requests).toHaveLength(1)
    const request = adapter.requests[0]!
    expect(request.sessionId).toBe(agent.session.id)
    expect(request.sessionId).toBe(session.id)
    expect(session.id).toBe(SessionId('routing-single'))
    // The identity rides GenerateOptions only: it is not added to the system
    // prompt or the review text (the only session-adjacent text retained here is
    // the unrelated rpcId handed to appendUser above).
    const promptText = (request.messages[0]!.content[0] as { type: 'text'; text: string }).text
    expect(promptText).not.toContain(String(agent.session.id))
    expect(request.system).not.toContain(String(agent.session.id))
    expect(request.messages[0]).not.toHaveProperty('id')
    expect(request.messages[0]).not.toHaveProperty('source')
  })

  it('keeps two in-flight Auto sessions on their own reviewer identities', async () => {
    // Explicit barrier: each scripted response records its request, then waits
    // until both reviews have been observed before either review resolves.
    const firstEntered = Promise.withResolvers<undefined>()
    const bothEntered = Promise.withResolvers<undefined>()
    let entered = 0
    const barrierResponse = (onEnter: () => void): ReviewScript => () => {
      onEnter()
      entered += 1
      if (entered === 2) bothEntered.resolve(undefined)
      return (async function* (): AsyncIterable<StreamChunk> {
        await bothEntered.promise
        yield* decisionChunks('{"risk":"low","decision":"allow"}')
      })()
    }
    const { ctx, adapter } = await harness([
      barrierResponse(() => { firstEntered.resolve(undefined) }),
      barrierResponse(() => {}),
    ])
    const probe = registerProbe(ctx)
    const sessionA = autoSession(ctx, 'routing-concurrent-a')
    const sessionB = autoSession(ctx, 'routing-concurrent-b')
    for (const item of [sessionA, sessionB]) {
      appendHeader(item.session, [{ name: 'probe', description: 'probe', parameters: { type: 'object' } }])
    }

    // Start A and wait until its review is actually inside the recording adapter,
    // then start B. That makes the request order deterministic while leaving both
    // reviews blocked on the shared deferred and therefore simultaneously in flight.
    const pendingA = executeReviewedNative(ctx, sessionA.session, sessionA.agent, 'concurrent-a', '{"path":"a"}', { path: 'a' })
    await firstEntered.promise
    const pendingB = executeReviewedNative(ctx, sessionB.session, sessionB.agent, 'concurrent-b', '{"path":"b"}', { path: 'b' })
    await bothEntered.promise

    expect(adapter.requests).toHaveLength(2)
    expect(adapter.requests.map(request => request.sessionId)).toEqual([
      sessionA.session.id,
      sessionB.session.id,
    ])

    const [resultA, resultB] = await Promise.all([pendingA, pendingB])
    expect(resultA.isError).toBe(false)
    expect(resultB.isError).toBe(false)
    expect(probe.runs()).toBe(2)
    expect(adapter.requests).toHaveLength(2)

    // Tie each recorded request back to the call it reviewed, so a swapped id
    // cannot pass by merely using the same set of ids.
    const actionBySessionId = new Map(adapter.requests.map((request) => {
      const action = requestSections(request).PENDING_ACTION as { arguments: { path: string } }
      return [String(request.sessionId), action.arguments.path] as const
    }))
    expect(actionBySessionId.get(String(sessionA.session.id))).toBe('a')
    expect(actionBySessionId.get(String(sessionB.session.id))).toBe('b')
    expect(adapter.requests[0]!.sessionId).not.toBe(sessionB.session.id)
    expect(adapter.requests[1]!.sessionId).not.toBe(sessionA.session.id)
  })

  it('uses the in-process child session id for a subagent review, never the parent id', async () => {
    const { ctx, adapter } = await harness([decisionChunks('{"risk":"low","decision":"allow"}')])
    const probe = registerProbe(ctx)
    const parentId = SessionId('routing-subagent-parent')
    const parentSession = ctx.sessions.create(parentId, { meta: { cwd: '/workspace' } })
    const parentAgent = agentFor(parentSession)
    // A subagent child is a separate Session whose header records its lineage.
    const childSession = ctx.sessions.create(SessionId('routing-subagent-child'), {
      meta: { cwd: '/workspace', parentSession: parentId, origin: 'subagent' },
    })
    expect(childSession.header.origin).toBe('subagent')
    expect(childSession.header.parentSession).toBe(parentId)
    ctx.permissionPresets.set(childSession, AUTO_PRESET)
    const childAgent = agentFor(childSession)
    appendHeader(childSession, [{ name: 'probe', description: 'probe', parameters: { type: 'object' } }])
    appendUser(childSession, 'Run the delegated probe once.', {
      kind: 'user', rpcId: 'routing-subagent-child-rpc',
    } as never)

    const result = await executeReviewedNative(ctx, childSession, childAgent, 'routing-subagent')

    expect(result.isError).toBe(false)
    expect(probe.runs()).toBe(1)
    expect(adapter.requests).toHaveLength(1)
    const request = adapter.requests[0]!
    expect(request.sessionId).toBe(childSession.id)
    expect(request.sessionId).not.toBe(parentSession.id)
    expect(request.sessionId).not.toBe(parentAgent.id)
    expect(String(request.sessionId)).toBe('routing-subagent-child')
  })

  it('attributes a PTC inner review to its owning session and keeps outer run_code excluded', async () => {
    const { ctx, adapter } = await harness([decisionChunks('{"risk":"low","decision":"allow"}')])
    const probe = registerProbe(ctx)
    const { session, agent } = autoSession(ctx, 'routing-ptc-inner')
    setApprovalPolicy(session, 'never')
    appendHeader(session)
    const outerCallId = ToolCallId('routing-ptc-outer')
    const subCallId = ToolCallId('routing-ptc-outer:code:0')
    appendAssistant(session, [
      { type: 'tool-call', id: outerCallId, name: RUN_CODE_NAME, arguments: '{"code":"probe()"}' },
    ])
    appendNativeCall(session, outerCallId, RUN_CODE_NAME, '{"code":"probe()"}')
    session.append('tool/ptc-dispatch-start', {
      rootCallId: outerCallId,
      parentCallId: outerCallId,
      subCallId,
      name: 'probe',
      arguments: { path: 'inside' },
    })

    const innerResult = await ctx.tools.execute({
      signal: new AbortController().signal,
      rootCallId: outerCallId,
      parent: Symbol('outer execution') as ToolExecutionToken,
      callId: subCallId,
      name: 'probe',
      schema: { name: 'probe', description: 'logged inner description', parameters: { type: 'object' } },
      arguments: { path: 'inside' },
      agent,
    })

    expect(innerResult.isError).toBe(false)
    expect(probe.runs()).toBe(1)
    expect(adapter.requests).toHaveLength(1)
    expect(adapter.requests[0]!.sessionId).toBe(agent.session.id)
    expect(adapter.requests[0]!.sessionId).toBe(session.id)
    const sections = requestSections(adapter.requests[0]!)
    expect(sections.PENDING_ACTION).toMatchObject({ mode: 'ptc-inner', name: 'probe' })

    // The outer run_code transport stays excluded from review even in an Auto session.
    const outerResult = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('routing-outer-run-code'),
      name: RUN_CODE_NAME,
      arguments: { code: 'return 1' },
      agent,
    })
    expect(outerResult.isError).toBe(true)
    expect(adapter.requests).toHaveLength(1)
  })
})

describe('non-allow outcomes keep identity and never execute the body', () => {
  it('honors ask and never approval priority on reviewer denials', async () => {
    const { ctx, adapter } = await harness([
      decisionChunks('{"risk":"medium","decision":"deny","reason":"not authorized"}'),
      decisionChunks('{"risk":"medium","decision":"deny","reason":"not authorized"}'),
    ])
    const probe = registerProbe(ctx)
    const approvalReasons: Array<string | undefined> = []
    ctx.on('approval/request', (request) => {
      approvalReasons.push(request.reason)
      return Promise.resolve<ApprovalOutcome>('rejected')
    })

    // `never`: the reviewer denial is final; the user is never asked.
    const never = autoSession(ctx, 'routing-never')
    setApprovalPolicy(never.session, 'never')
    appendHeader(never.session, [{ name: 'probe', description: 'probe', parameters: { type: 'object' } }])
    never.session.append('turn/start', { turn: 1 })
    const neverResult = await executeReviewedNative(ctx, never.session, never.agent, 'routing-never')
    expect(neverResult).toMatchObject({ isError: true, error: { info: { code: 'AUTO_REVIEW_DENIED' } } })
    expect(probe.runs()).toBe(0)
    expect(approvalReasons).toEqual([])
    expect(adapter.requests[0]!.sessionId).toBe(never.agent.session.id)

    // `ask`: the same denial becomes a human approval request; rejecting it keeps
    // the body unexecuted, and the request still carries this session's identity.
    const ask = autoSession(ctx, 'routing-ask')
    appendHeader(ask.session, [{ name: 'probe', description: 'probe', parameters: { type: 'object' } }])
    // The approval audit pair must be enclosed in an open turn.
    ask.session.append('turn/start', { turn: 1 })
    const askResult = await executeReviewedNative(ctx, ask.session, ask.agent, 'routing-ask')
    expect(askResult).toMatchObject({ isError: true, error: { message: 'the user rejected tool "probe"' } })
    expect(probe.runs()).toBe(0)
    expect(approvalReasons).toEqual(['Auto review denied tool "probe": not authorized'])
    expect(adapter.requests[1]!.sessionId).toBe(ask.agent.session.id)
    expect(adapter.requests[1]!.sessionId).not.toBe(never.agent.session.id)
  })

  it('fails closed on technical reviewer failure or invalid JSON without executing the body', async () => {
    const providerFailure = async function* (): AsyncIterable<StreamChunk> {
      throw new Error('gateway refused')
    }
    const { ctx, adapter } = await harness([
      providerFailure,
      decisionChunks('not json'),
    ])
    const probe = registerProbe(ctx)
    const cases = [
      { id: 'routing-technical-error', failure: true },
      { id: 'routing-invalid-json', failure: false },
    ] as const

    for (const item of cases) {
      const { session, agent } = autoSession(ctx, item.id)
      appendHeader(session, [{ name: 'probe', description: 'probe', parameters: { type: 'object' } }])
      const result = await executeReviewedNative(ctx, session, agent, item.id)
      if (!result.isError) throw new Error(`${item.id} executed`)
      expect(result.error.info).toBeUndefined()
      expect(result.error.message.startsWith(
        'Auto review of tool "probe" failed; its body was not executed: ',
      )).toBe(true)
      const request = adapter.requests.at(-1)!
      expect(request.sessionId).toBe(agent.session.id)
      expect(request.sessionId).toBe(session.id)
    }

    expect(probe.runs()).toBe(0)
    expect(adapter.requests).toHaveLength(cases.length)

    expect(adapter.requests[0]!.sessionId).toBe(SessionId('routing-technical-error'))
    expect(adapter.requests[1]!.sessionId).toBe(SessionId('routing-invalid-json'))
  })

  it('cancels an in-flight review without dispatching the tool body', async () => {
    const entered = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    const controlled = async function* (): AsyncIterable<StreamChunk> {
      entered.resolve(undefined)
      await release.promise
      yield* decisionChunks('{"risk":"medium","decision":"allow"}')
    }
    const { ctx, adapter } = await harness([controlled])
    const probe = registerProbe(ctx)
    const { session, agent } = autoSession(ctx, 'routing-cancel')
    appendHeader(session, [{ name: 'probe', description: 'probe', parameters: { type: 'object' } }])
    const callId = ToolCallId('routing-cancel-call')
    appendAssistant(session, [{ type: 'tool-call', id: callId, name: 'probe', arguments: '{}' }])
    appendNativeCall(session, callId, 'probe', '{}')
    const controller = new AbortController()

    const pending = ctx.tools.execute({
      signal: controller.signal, callId, name: 'probe', arguments: {}, agent,
    })
    await entered.promise
    controller.abort(new Error('caller stopped'))
    expect(adapter.requests[0]?.signal?.aborted).toBe(true)
    release.resolve(undefined)
    const result = await pending

    expect(probe.runs()).toBe(0)
    expect(result).toMatchObject({
      isError: true,
      error: { info: { code: TOOL_ABORTED_BEFORE_DISPATCH } },
    })
    expect(adapter.requests).toHaveLength(1)
    expect(adapter.requests[0]!.sessionId).toBe(agent.session.id)
    expect(adapter.requests[0]!.sessionId).toBe(session.id)
  })
})
