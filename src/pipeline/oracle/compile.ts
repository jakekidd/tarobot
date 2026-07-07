// The oracle compile — one call, run once after the mini-intake. Produces
// the frozen Brief the engine reads from. Card choice happens here (the
// model picks 4 from the mini-deck whose symbology serves the material);
// invalid or duplicate picks are repaired from the deck deterministically
// rather than re-rolled, so a sloppy pick degrades to a random-ish deal
// instead of a failed session.

import type { LLMAdapter } from '../llm/adapter';
import { deckCard, ORACLE_DECK } from './deck';
import { COMPILE_SYSTEM, COMPILE_TOOL } from './prompts';
import { CompiledBriefSchema } from './schemas';
import type { MiniIntake, OracleBrief, OracleCard } from './types';

export async function compileBrief(
  adapter: LLMAdapter,
  intake: MiniIntake,
): Promise<OracleBrief> {
  const taboos = intake.off_limits?.trim() ? [intake.off_limits.trim()] : [];
  const compiled = await adapter.invoke(
    {
      system: COMPILE_SYSTEM,
      user: JSON.stringify(
        {
          INTAKE: {
            name: intake.name || undefined,
            how_the_year_treated_them: intake.year,
            what_is_circling: intake.circling,
            who_is_on_their_mind: intake.who || undefined,
            free_line: intake.free_line || undefined,
          },
          TABOOS: taboos,
          DECK: ORACLE_DECK,
          instruction: 'compile the brief now.',
        },
        null,
        2,
      ),
      tool: COMPILE_TOOL,
      model: 'cognition',
      max_tokens: 3000,
    },
    CompiledBriefSchema,
  );

  return {
    name: intake.name?.trim() || undefined,
    portrait: compiled.portrait,
    fork: compiled.fork,
    leads: compiled.leads,
    cards: repairCards(compiled.cards),
    opening: compiled.opening,
    mantra: compiled.mantra,
    taboos,
  };
}

function repairCards(
  picked: { id: string; slot: number; guide: string }[],
): OracleCard[] {
  const used = new Set<string>();
  const cards: OracleCard[] = [];
  for (let i = 0; i < 4; i++) {
    const pick = picked[i];
    let card = pick ? deckCard(pick.id) : undefined;
    if (!card || used.has(card.id)) {
      card = ORACLE_DECK.find((c) => !used.has(c.id));
    }
    if (!card) throw new Error('oracle deck exhausted while repairing the deal');
    used.add(card.id);
    cards.push({
      id: card.id,
      name: card.name,
      slot: (i + 1) as OracleCard['slot'],
      guide:
        pick?.guide ??
        `the ${card.name}: ${card.themes.join('; ')}. ${card.voice_note}`,
    });
  }
  return cards;
}
