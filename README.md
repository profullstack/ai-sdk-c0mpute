# @profullstack/ai-sdk-c0mpute

[c0mpute](https://c0mpute.com) provider for the [Vercel AI SDK](https://ai-sdk.dev).

c0mpute is a decentralized, peer-to-peer compute network. Your request runs on someone's spare computer (a "node") that serves open-weight models such as Qwen, Devstral and Nemotron. There is no rate card: every job is a sealed-bid auction among the nodes online, the lowest bid under your cap wins, and the market takes a 5% fee. Speed and quality vary by node and model, so treat it as a cheap, open alternative for everyday text work rather than a drop-in for a frontier model.

The whole stack is MIT licensed: [github.com/profullstack/c0mpute](https://github.com/profullstack/c0mpute).

## Install

```bash
npm install @profullstack/ai-sdk-c0mpute ai
```

Get an API key (`c0k_...`) from the keys tab of [c0mpute.com/chat](https://c0mpute.com/chat) (sign in with CoinPay), then:

```bash
export C0MPUTE_API_KEY=c0k_...
```

Usage is billed to your c0mpute balance. With an empty balance the account falls back to a small free daily allowance.

## Usage

```ts
import { c0mpute } from '@profullstack/ai-sdk-c0mpute';
import { generateText } from 'ai';

const { text, response } = await generateText({
  model: c0mpute('auto'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});

console.log(text);
console.log('served by', response.modelId); // the concrete model the router picked
```

### Streaming

```ts
import { c0mpute } from '@profullstack/ai-sdk-c0mpute';
import { streamText } from 'ai';

const result = streamText({
  model: c0mpute('auto:fast'),
  prompt: 'Explain sealed-bid auctions in three sentences.',
});

for await (const chunk of result.textStream) process.stdout.write(chunk);
```

Streams are standard Server-Sent Events. A job waits in an auction and a queue before a node starts it, so the first text can take several seconds, and it often arrives in a few large chunks rather than token by token.

### Custom settings

```ts
import { createC0mpute } from '@profullstack/ai-sdk-c0mpute';

const c0mpute = createC0mpute({
  apiKey: process.env.MY_C0MPUTE_KEY, // defaults to C0MPUTE_API_KEY
  baseURL: 'https://c0mpute.com/v1', // the default
  headers: { 'x-app': 'my-app' },
  // fetch: customFetch,
});
```

## Models

| Model id | What it is |
| --- | --- |
| `auto` | The c0mpute router picks an open model per request (default choice) |
| `auto:fast`, `auto:standard`, `auto:high`, `auto:max` | Router with a speed / quality preference |
| `qwen3:4b`, `qwen2.5-coder:7b`, `qwen2.5-coder:14b`, `qwen3-coder:30b`, `qwen3.8:27b`, `devstral:24b`, `nemotron-3-nano:30b`, ... | A specific open-weight model |

Concrete models are only available while a node that serves them is online. The live list is at [c0mpute.com/v1/models](https://c0mpute.com/v1/models). If no node serves a model right now the API answers with an error that names the ones that are, and under heavy load you may see `Network is busy`. `auto` is the most reliable choice. The model that actually answered is in `response.modelId`, and the router's reasoning is in `providerMetadata.c0mpute.route`.

## What works and what does not

| Feature | Status |
| --- | --- |
| Text generation (`generateText`) | Yes |
| Streaming (`streamText`) | Yes |
| `temperature`, `maxOutputTokens` (up to 8192) | Yes |
| Tool calling (`tools`, `toolChoice`, multi-step agents) | Yes, on `auto` and tool-capable models (`qwen3:4b`, `nemotron-3-nano:4b`, `qwen2.5-coder:7b`, `qwen3-coder:30b`, ...). Other models answer 400. See [c0mpute.com/docs#api](https://c0mpute.com/docs#api). |
| Image / file input | No. Text only; non-text parts are removed with a warning. |
| Structured output | Not enforced. Ask for JSON in the prompt and validate it yourself. |
| Embeddings, images | Not through this provider |

The API also limits a request to 200 messages and 200,000 characters. Very long outputs from large models on CPU nodes may not finish before the stream closes (about 10 minutes), so split long jobs.

## Run a node and earn

c0mpute is only as big as the machines on it. If you have a spare CPU or GPU, run a node and get paid for the jobs it wins:

```bash
curl -fsSL https://c0mpute.com/install.sh | sh
```

Linux, macOS and Windows (WSL2), CPU or GPU. See [c0mpute.com/providers](https://c0mpute.com/providers).

## Development

```bash
npm install
npm test                                  # unit tests, no network
C0MPUTE_API_KEY=c0k_... npm run test:live # real calls against c0mpute.com
npm run build
```

## License

MIT, see [LICENSE](LICENSE). Made by [Profullstack](https://profullstack.com).
