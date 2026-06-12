// The naive Compiler — first honest attempt, deliberately shallow.
//
// What it does: deals the spread (compile-time, per the festival design),
// makes ONE cognition call that extrapolates the core-story narrative from
// everything the antechamber discovered, and assembles the seer's input
// shape. What it does NOT do (the in-depth compiler's work, unbuilt): the
// expert fan-out (psychologist / mythologist / …), the Augur outcome
// documents, the Cheat (the one-card swap), per-card pre-computation.
//
// The narrative call is CARD-BLIND on purpose: the brief feeds every
// per-card director thread, and those threads must never see unflipped
// faces — naming the cards here would leak the whole spread into round 1.

import BRIEF_SYSTEM from '../../../materials/prompts/compiler/brief.md?raw';
import type { LLMAdapter } from '../llm/adapter';
import type { AntechamberOutput, Dilemma } from '../tuning';
import type { Hunch, Profile } from '../types';
import { drawForSpread } from '../cards';
import { FOUR_CARD_DIAMOND } from '../spreads';
import type { CompiledBrief } from './types';

export async function compile(
  adapter: LLMAdapter,
  output: AntechamberOutput,
): Promise<CompiledBrief> {
  const drawn = drawForSpread(FOUR_CARD_DIAMOND);
  const primary = output.dilemmas.find((d) => d.confirmed) ?? output.dilemmas[0];

  const prose_brief = await adapter.invokeFreeform({
    system: BRIEF_SYSTEM,
    user: JSON.stringify(
      {
        identity: output.identity,
        raw_picks: output.raw_picks,
        portrait_md: output.portrait_md,
        dilemmas: output.dilemmas.map((d) => ({
          territory: d.territory,
          reframe: d.reframe,
          confirmed: d.confirmed,
          conjector_close: d.summary_md,
        })),
        hunt_ended: output.ended,
        instruction:
          'write the brief now. four to six short markdown paragraphs, third person, present tense. the confirmed reframe is the spine; unconfirmed threads stay honestly uncertain.',
      },
      null,
      2,
    ),
    model: 'cognition',
    max_tokens: 1200,
    label: 'compiler_brief',
  });

  return {
    subject_name: output.identity.name || 'unknown',
    intention: primary?.reframe || 'what is alive for them right now',
    prose_brief: prose_brief.trim(),
    profile: assembleProfile(output, prose_brief.trim()),
    drawn,
    outcomes: [],
  };
}

/** The seer's legacy Profile shape, filled honestly from the antechamber
 *  output. Empty where the new pipeline has nothing — no invention. The
 *  prose_brief carries the synthesis; this carries the structure. */
function assembleProfile(output: AntechamberOutput, brief: string): Profile {
  const b = output.identity.birthday;
  return {
    identity: {
      name: output.identity.name || undefined,
      birth_date: b
        ? `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`
        : undefined,
      sun_sign: output.identity.sun_sign ?? undefined,
      life_path: output.identity.life_path ?? undefined,
      tarot_birth_card: output.identity.birth_card ?? undefined,
      notes: [
        output.identity.relationship_status
          ? `relationship: ${output.identity.relationship_status}`
          : null,
        output.raw_picks['yearning'] ? `wants most: ${output.raw_picks['yearning']}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    },
    candidates: [],
    cast: [],
    threads: [],
    hunches: output.dilemmas.map(dilemmaToHunch),
    margin: '',
    cognition_log: '',
    highlights: [],
    brief,
    ready_to_close: true,
    version: 1,
  };
}

function dilemmaToHunch(d: Dilemma): Hunch {
  return {
    suspicion: d.reframe || d.hypothesis,
    grounded_in: `conjector thread ${d.id} (${d.territory})${
      d.confirmed ? ' — reframe confirmed YES by the player' : ' — unconfirmed (soft close)'
    }`,
    confidence: d.confirmed ? 0.9 : 0.5,
    age_turns: 0,
  };
}
