/**
 * Legal response fixtures for the four chat wire protocols routed by pi-ai
 * 1.1.0's `opencode` provider (`dist/providers/opencode.js`):
 * `openai-completions`, `openai-responses`, `anthropic-messages`, and
 * `google-generative-ai`.
 *
 * Each builder frames one complete assistant text response that the real pi-ai
 * API parser turns into a single text block and a `stop` finish, using the
 * event shapes documented by that protocol. The Auto reviewer decision text is
 * the only payload, so the fixtures stay protocol-shaped rather than
 * DSH-shaped.
 */
import type { SseFrame } from './mock-opencode-server.ts'

/** Chat protocols the pi-ai `opencode` provider declares. */
export type OpenCodeChatApi =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-generative-ai'

/** The exact reviewer decision every transport case serves. */
export const ALLOW_LOW_DECISION = '{"risk":"low","decision":"allow"}'

/** The exact reviewer denial served by the refusal transport case. */
export const DENY_MEDIUM_DECISION = '{"risk":"medium","decision":"deny","reason":"not authorized"}'

/** One bare `data:` frame carrying pretty-printed JSON. */
function data(value: unknown): SseFrame {
  return JSON.stringify(value)
}

/** One named SSE frame whose `data` payload repeats the event name as `type`. */
function frame(event: string, payload: Record<string, unknown>): SseFrame {
  return { event, data: JSON.stringify({ type: event, ...payload }) }
}

/** OpenAI Chat Completions chunks ending with the `[DONE]` sentinel. */
function openaiCompletionsEvents(text: string): SseFrame[] {
  return [
    data({ choices: [{ delta: { role: 'assistant', content: '' }, index: 0, finish_reason: null }] }),
    data({ choices: [{ delta: { content: text }, index: 0, finish_reason: null }] }),
    data({
      choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    }),
    data('[DONE]'),
  ]
}

/** OpenAI Responses events from creation through the terminal completion. */
function openaiResponsesEvents(text: string): SseFrame[] {
  return [
    frame('response.created', { response: { id: 'resp_transport' } }),
    frame('response.output_item.added', {
      output_index: 0,
      item: { type: 'message', id: 'msg_transport', role: 'assistant', content: [] },
    }),
    frame('response.output_text.delta', {
      output_index: 0,
      item_id: 'msg_transport',
      content_index: 0,
      delta: text,
    }),
    frame('response.output_item.done', {
      output_index: 0,
      item: {
        type: 'message',
        id: 'msg_transport',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      },
    }),
    frame('response.completed', {
      response: {
        id: 'resp_transport',
        status: 'completed',
        usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
      },
    }),
  ]
}

/** Anthropic Messages frames from `message_start` to `message_stop`. */
function anthropicMessagesEvents(text: string): SseFrame[] {
  return [
    { event: 'message_start', data: JSON.stringify({
      type: 'message_start',
      message: {
        id: 'msg_transport',
        type: 'message',
        role: 'assistant',
        model: 'transport-model',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 11, output_tokens: 1 },
      },
    }) },
    { event: 'content_block_start', data: JSON.stringify({
      type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' },
    }) },
    { event: 'content_block_delta', data: JSON.stringify({
      type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text },
    }) },
    { event: 'content_block_stop', data: JSON.stringify({ type: 'content_block_stop', index: 0 }) },
    { event: 'message_delta', data: JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 7 },
    }) },
    { event: 'message_stop', data: JSON.stringify({ type: 'message_stop' }) },
  ]
}

/** Google Generative AI chunks with the candidate text and its STOP finish. */
function googleGenerativeAiEvents(text: string): SseFrame[] {
  return [
    data({
      candidates: [{
        content: { role: 'model', parts: [{ text }] },
        index: 0,
        finishReason: 'STOP',
      }],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 },
    }),
  ]
}

/** SSE response frames for one complete text response on the given protocol. */
export function eventsForApi(api: OpenCodeChatApi, text: string): SseFrame[] {
  switch (api) {
    case 'openai-completions': return openaiCompletionsEvents(text)
    case 'openai-responses': return openaiResponsesEvents(text)
    case 'anthropic-messages': return anthropicMessagesEvents(text)
    case 'google-generative-ai': return googleGenerativeAiEvents(text)
  }
}
