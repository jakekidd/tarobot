import Anthropic from '@anthropic-ai/sdk';

// Models — keep in one place so swapping is a one-liner.
export const MODELS = {
  // Used for all cognition calls (interview, finalize, reading) in MVP.
  // Sonnet hits the latency/quality sweet spot for these structured tool calls.
  COGNITION: 'claude-sonnet-4-6',
  // Reserved for tiny ops (key validation, classification).
  TINY: 'claude-haiku-4-5',
} as const;

export type ClaudeClient = Anthropic;

/**
 * Build an Anthropic client that runs in the browser.
 *
 * dangerouslyAllowBrowser is the documented escape hatch — acceptable for
 * a local-only MVP where the user supplies their own key. Production deploys
 * MUST proxy through a server that holds the key.
 */
export function createClaudeClient(apiKey: string): ClaudeClient {
  const trimmed = apiKey.trim();
  if (!trimmed.startsWith('sk-ant-')) {
    throw new Error('api key must begin with "sk-ant-"');
  }
  return new Anthropic({
    apiKey: trimmed,
    dangerouslyAllowBrowser: true,
  });
}

/**
 * Smoke-test a key with the smallest legal call. Resolves to true on success,
 * throws a useful Error on auth/network failure.
 */
export async function validateKey(client: ClaudeClient): Promise<true> {
  await client.messages.create({
    model: MODELS.TINY,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'hi' }],
  });
  return true;
}
