// The Scribe — the AI counterpart to the survey's authored channels.
//
// When a player WRITES IN an answer instead of picking one, the survey captures
// their raw text but cannot produce the channels (indicators / implications /
// identities / shadow / notes) or a weight — that needs a model, and the survey
// runs NO AI. The Scribe is that enrichment: one fast call that reads the facet
// and the typed answer and returns the same shape an authored option carries,
// plus a weight, so a write-in folds into the Condenser exactly like a picked
// option. The `notes` channel is the Scribe's latitude — free-form prose the
// structured channels can't hold.
//
// Fired at survey close (before the Condenser) for every free-text facet, in
// parallel. System prompt: materials/prompts/scribe.md.

import { z } from 'zod';
import WRITE_IN_ENRICHER_PROMPT from '../../../materials/prompts/scribe.md?raw';
import type { LLMAdapter, ToolDef } from '../llm/adapter';
import type { SurveyFacet } from '../introduction-survey/schema';
import type { Channels } from '../introduction-survey/types';

/** What an authored option carries, produced on the fly for a write-in. */
export type WriteInEnrichment = Channels & {
  /** One line: what NOT giving this answer would mean. */
  shadow: string;
  /** 0-3 valence, matching the authored weight scale. */
  weight: number;
};

const WriteInEnrichmentSchema = z.object({
  indicators: z.array(z.string()).default([]),
  implications: z.array(z.string()).default([]),
  identities: z.array(z.string()).default([]),
  hooks: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  shadow: z.string().default(''),
  weight: z.number().int().min(0).max(3),
});

const WRITE_IN_ENRICHER_TOOL: ToolDef = {
  name: 'enrich_write_in',
  description: 'enrich a written-in survey answer into the channels a listed option carries.',
  input_schema: z.toJSONSchema(WriteInEnrichmentSchema) as Record<string, unknown>,
};

/** Enrich a write-in into authored-option shape. Fast tier (Haiku) — a small,
 *  well-scoped extraction calibrated against the facet's listed options. */
export async function enrichWriteIn(
  adapter: LLMAdapter,
  facet: SurveyFacet,
  answer: string,
): Promise<WriteInEnrichment> {
  const payload = {
    question: facet.question,
    hidden_target: facet.hidden_target ?? null,
    the_players_written_answer: answer,
    listed_options_for_calibration: facet.options.map((o) => ({
      label: o.label,
      weight: o.weight,
      indicators: o.indicators,
      implications: o.implications,
      identities: o.identities,
      shadow: o.shadow,
    })),
    instruction:
      'enrich the written answer into the channels a listed option carries, plus weight, shadow, and free-form notes. match the register and discipline of the listed options.',
  };
  return adapter.invoke<WriteInEnrichment>(
    {
      system: WRITE_IN_ENRICHER_PROMPT,
      user: JSON.stringify(payload, null, 2),
      tool: WRITE_IN_ENRICHER_TOOL,
      model: 'fast',
      max_tokens: 600,
    },
    WriteInEnrichmentSchema,
  );
}
