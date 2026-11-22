import { generateText, streamText, tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { C0MPUTE_BASE_URL, createC0mpute, toC0mputeBody } from '../src/index';

type Call = { url: string; headers: Headers; body: any };

function mockFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetch = async (input: any, init?: any) => {
    const call = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return respond(call);
  };
  return { fetch, calls };
}

const completion = (content: string) =>
  new Response(
    JSON.stringify({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1,
      model: 'qwen3:4b',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
      x_c0mpute_route: { router: 'c0mpute-router/1', final: { model: 'qwen3:4b' } },
    }),
    { headers: { 'content-type': 'application/json' } },
  );

describe('createC0mpute', () => {
  it('calls the c0mpute endpoint with the bearer key', async () => {
    const { fetch, calls } = mockFetch(() => completion('pong'));
    const c0mpute = createC0mpute({ apiKey: 'c0k_test', fetch });
    const result = await generateText({ model: c0mpute('auto'), prompt: 'ping' });

    expect(result.text).toBe('pong');
    expect(calls[0].url).toBe(`${C0MPUTE_BASE_URL}/chat/completions`);
    expect(calls[0].headers.get('authorization')).toBe('Bearer c0k_test');
    expect(calls[0].body.model).toBe('auto');
    expect(calls[0].body.messages).toEqual([{ role: 'user', content: 'ping' }]);
    expect(result.response.modelId).toBe('qwen3:4b');
    expect((result.providerMetadata as any)?.c0mpute?.route?.router).toBe('c0mpute-router/1');
  });

  it('reads C0MPUTE_API_KEY from the environment', async () => {
    const before = process.env.C0MPUTE_API_KEY;
    process.env.C0MPUTE_API_KEY = 'c0k_env';
    try {
      const { fetch, calls } = mockFetch(() => completion('ok'));
      await generateText({ model: createC0mpute({ fetch })('auto'), prompt: 'x' });
      expect(calls[0].headers.get('authorization')).toBe('Bearer c0k_env');
    } finally {
      if (before === undefined) delete process.env.C0MPUTE_API_KEY;
      else process.env.C0MPUTE_API_KEY = before;
    }
  });

  it('honors a custom baseURL without a trailing slash', async () => {
    const { fetch, calls } = mockFetch(() => completion('ok'));
    const c0mpute = createC0mpute({ apiKey: 'k', baseURL: 'http://localhost:9999/v1/', fetch });
    await generateText({ model: c0mpute.chatModel('qwen3:4b'), prompt: 'x' });
    expect(calls[0].url).toBe('http://localhost:9999/v1/chat/completions');
  });

  it('sends tools and reads tool calls back', async () => {
    const { fetch, calls } = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            created: 1,
            model: 'qwen3:4b',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    { id: 'call_1', type: 'function', function: { name: 'weather', arguments: '{"city":"Paris"}' } },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    const c0mpute = createC0mpute({ apiKey: 'k', fetch });
    const result = await generateText({
      model: c0mpute('auto'),
      prompt: 'weather?',
      tools: { weather: tool({ inputSchema: z.object({ city: z.string() }) }) },
    });
    expect(calls[0].body.tools[0].function.name).toBe('weather');
    expect(result.warnings?.some((w: any) => w.feature === 'tools')).toBe(false);
    expect(result.toolCalls[0].toolName).toBe('weather');
    expect(result.toolCalls[0].input).toEqual({ city: 'Paris' });
    expect(result.finishReason).toBe('tool-calls');
  });

  it('streams tool call deltas', async () => {
    const chunk = (delta: any, finish: string | null = null) =>
      'data: ' +
      JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'qwen3:4b', choices: [{ index: 0, delta, finish_reason: finish }] });
    const sse = [
      ': c0mpute tools',
      chunk({ role: 'assistant', content: null }),
      chunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'weather', arguments: '' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '{"city":' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '"Paris"}' } }] }),
      chunk({}, 'tool_calls'),
      'data: [DONE]',
      '',
    ].join('\n\n');
    const { fetch } = mockFetch(() => new Response(sse, { headers: { 'content-type': 'text/event-stream' } }));
    const result = streamText({
      model: createC0mpute({ apiKey: 'k', fetch })('qwen3:4b'),
      prompt: 'weather?',
      tools: { weather: tool({ inputSchema: z.object({ city: z.string() }) }) },
    });
    const toolCalls = await result.toolCalls;
    expect(toolCalls[0].toolName).toBe('weather');
    expect(toolCalls[0].input).toEqual({ city: 'Paris' });
    expect(await result.finishReason).toBe('tool-calls');
  });

  it('parses a stream that carries SSE status comments', async () => {
    const sse = [
      'data: {"id":"c","object":"chat.completion.chunk","created":1,"model":"qwen3:4b","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}',
      ': status {"state":"running","eta_s":22}',
      'data: {"id":"c","object":"chat.completion.chunk","created":1,"model":"qwen3:4b","choices":[{"index":0,"delta":{"content":"1 2 3"},"finish_reason":null}]}',
      'data: {"id":"c","object":"chat.completion.chunk","created":1,"model":"qwen3:4b","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      'data: [DONE]',
      '',
    ].join('\n\n');
    const { fetch, calls } = mockFetch(
      () => new Response(sse, { headers: { 'content-type': 'text/event-stream' } }),
    );
    const c0mpute = createC0mpute({ apiKey: 'k', fetch });
    const result = streamText({ model: c0mpute('auto'), prompt: 'count' });
    let text = '';
    for await (const part of result.textStream) text += part;
    expect(text).toBe('1 2 3');
    expect(calls[0].body.stream).toBe(true);
    expect(await result.finishReason).toBe('stop');
  });

  it('throws NoSuchModelError for embedding and image models', () => {
    const c0mpute = createC0mpute({ apiKey: 'k' });
    expect(() => c0mpute.embeddingModel('x')).toThrow();
    expect(() => c0mpute.imageModel('x')).toThrow();
    expect(c0mpute.specificationVersion).toBe('v4');
  });
});

describe('toC0mputeBody', () => {
  it('joins text-only content arrays into a string and drops non-text parts', () => {
    const warnings: any[] = [];
    const out = toC0mputeBody(
      {
        model: 'auto',
        messages: [
          { role: 'system', content: 'be brief' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'line one' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
              { type: 'text', text: 'line two' },
            ],
          },
        ],
      },
      warnings,
    );
    expect(out.messages[0]).toEqual({ role: 'system', content: 'be brief' });
    expect(out.messages[1]).toEqual({ role: 'user', content: 'line one\nline two' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('unsupported');
  });

  it('leaves a plain body untouched', () => {
    const body = { model: 'auto', messages: [{ role: 'user', content: 'hi' }], temperature: 0.2 };
    const warnings: any[] = [];
    expect(toC0mputeBody(body, warnings)).toEqual(body);
    expect(warnings).toHaveLength(0);
  });
});
