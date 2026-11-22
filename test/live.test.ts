import { generateText, streamText } from 'ai';
import { describe, expect, it } from 'vitest';
import { c0mpute } from '../src/index';

// Runs only with C0MPUTE_LIVE=1 and a real C0MPUTE_API_KEY. The network is an
// auction across peer nodes, so allow a few minutes per call.
const live = process.env.C0MPUTE_LIVE === '1' && !!process.env.C0MPUTE_API_KEY;

describe.skipIf(!live)('live c0mpute API', () => {
  it('generates text', async () => {
    const { text, response } = await generateText({
      model: c0mpute('auto'),
      prompt: 'What is 7 times 6? Answer with just the number.',
      maxOutputTokens: 50,
    });
    console.log('generateText served by', response.modelId, '->', JSON.stringify(text));
    expect(text).toContain('42');
  }, 240_000);

  it('streams text', async () => {
    const result = streamText({
      model: c0mpute('auto'),
      prompt: 'Count from 1 to 5 separated by spaces.',
      maxOutputTokens: 60,
    });
    let text = '';
    for await (const part of result.textStream) text += part;
    console.log('streamText ->', JSON.stringify(text));
    expect(text).toMatch(/1.*2.*3/s);
  }, 240_000);
});
