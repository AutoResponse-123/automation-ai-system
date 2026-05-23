export {};
const Anthropic = require('@anthropic-ai/sdk').default;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function callClaude(
  messages: any[],
  systemPrompt: string,
  maxTokens: number = 300
) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: messages,
  });

  const content = response.content[0];
  if (content.type === 'text') {
    return { text: content.text, tokens: response.usage?.output_tokens ?? 0 };
  }

  throw new Error('Unexpected response type from Claude');
}

module.exports = { callClaude };
