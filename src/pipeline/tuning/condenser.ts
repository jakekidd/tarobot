// The Condenser — RawPortrait → markdown Portrait, one Sonnet call.
//
// The single cognitive bottleneck where the survey's dense, overlapping
// fragments become a coherent read. It is freeform (no tool schema): the
// Portrait is prose the next AI reads, and AI-for-AI context breathes better
// as markdown than JSON. The task does not cleanly decompose (central leads
// derive from patterns + tensions; only cast is truly independent), so it is
// one call, not a parallel fan-out — surgical splits later if a section proves
// weak in testing. System prompt: materials/prompts/condenser.md.

import CONDENSER_SYSTEM from '../../../materials/prompts/condenser.md?raw';
import type { LLMAdapter } from '../llm/adapter';
import type { RawPortrait } from '../introduction-survey';
import type { Portrait } from './types';

export async function condense(adapter: LLMAdapter, raw: RawPortrait): Promise<Portrait> {
  const payload = {
    name: raw.identity.name || 'unknown',
    age_bracket: raw.identity.age_bracket,
    sun_sign: raw.identity.sun_sign,
    relationship_status: raw.identity.relationship_status,
    answers: raw.facets.map((f) => ({
      question: f.question,
      picked: f.chosen,
      weight: f.weight,
      indicators: f.channels.indicators,
      implications: f.channels.implications,
      identities: f.channels.identities,
      declined_shadows: f.shadows,
    })),
    instruction:
      'synthesize the Portrait now, in the exact markdown structure given. weight is 0-3 charge — let the hot answers lead. third person, present tense, specific.',
  };

  const markdown = await adapter.invokeFreeform({
    system: CONDENSER_SYSTEM,
    user: JSON.stringify(payload, null, 2),
    model: 'cognition',
    max_tokens: 1500,
    label: 'condenser',
  });

  return { markdown: markdown.trim(), raw };
}
