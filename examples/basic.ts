// npx tsx examples/basic.ts  (needs C0MPUTE_API_KEY)
import { generateText, streamText } from 'ai';
import { c0mpute } from '../src/index';

const { text, response } = await generateText({
  model: c0mpute('auto'),
  prompt: 'Explain what a sealed-bid auction is in two sentences.',
});
console.log(`[${response.modelId}]`, text);

const stream = streamText({ model: c0mpute('auto:fast'), prompt: 'Write a haiku about spare GPUs.' });
for await (const chunk of stream.textStream) process.stdout.write(chunk);
process.stdout.write('\n');
