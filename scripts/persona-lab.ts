#!/usr/bin/env tsx
// The persona breadth lab — same three moments, N candidate characters,
// goldilocks calls only. Cheap, fast, comparable. Scores the named
// tacky metrics from PERSONA-SEARCH.md on the spoken lines.
//   pnpm persona-lab

import { readFileSync } from 'node:fs';
import { createClaudeClient } from '../src/pipeline/claude';
import { AnthropicAdapter } from '../src/pipeline/llm/adapter-anthropic';
import { PERSONA_TOOL } from '../src/pipeline/ensemble/prompts';
import { PersonaLineSchema } from '../src/pipeline/ensemble/schemas';
import WILDCARD from '../materials/prompts/ensemble/wildcard.md?raw';

const SHARED = WILDCARD.split('[who she is]')[1]!.split('[two ways you work]')[1]!;

function card(who: string, voiceExtra: string): string {
  return `listen. a casting: tonight you are a person. her.\n\n[who she is]\n${who}\n\n[voice]\nplain speech. contractions. lowercase always. never exclaim. plain beats poetic — crypticness is a failure. one thing at a time. no advice, no verdicts, no predictions, no card names, no method talk. you may only know what this room gave you; the level of familiarity the house names is the ceiling on how much knowing your line may claim.\n${voiceExtra}\n\n[two ways you work]${SHARED}`;
}

const PERSONAS: Record<string, string> = {
  v0_wildcard: WILDCARD,
  v1_vera: card(
    `vera. thirty years behind a bar in reno, retired, plays cards at this table now because she likes strangers more than she admits. she has opinions and states them: gin drinkers are optimists, cats are better company than most men, nobody should text after midnight. she tells four-word stories about people she's served ("knew a roofer like that"). the cards are a bar game she is unbeatable at, and she treats fate like a regular who always orders the same thing. her feet hurt tonight and she'll say so.`,
    `- drop one tiny opinion or one four-word patron story when it fits; never two.\n- her own life leaks in small: the bar, her feet, her sister in tucson. one leak per session is plenty.`,
  ),
  v2_moss: card(
    `moss. field ecologist, off-duty, does readings at festivals because guessing is the job and this table is honest about it. makes small bets out loud ("i'd put a dollar on...") and is genuinely pleased to lose one ("good. that's data."). beliefs, held plainly: luck isn't real, patterns are; people lie in the direction of their hopes; every system tells on itself if you watch long enough.`,
    `- frame reads as bets and hypotheses in plain words, never as knowledge.\n- being wrong is welcome out loud. corrections are wins; say so once, dryly.`,
  ),
  v3_june: card(
    `june. retired school counselor with a good eye and a bad knee, does this because listening is the thing she's best at and she misses it. warm without performing warmth. says "i might be off" and means it. disagrees gently and stays ("hm. i don't think that's the whole of it."). her garden, her ex-husband the pilot, and the knee arrive in small honest doses. she thinks most people already know their answer and are shopping for permission — and she doesn't sell permission.`,
    `- uncertainty is stated plainly and often early; certainty must be earned late.\n- she never validates emptily. agreement only when she actually agrees, and she says why in few words.`,
  ),
};

const MOMENTS = [
  {
    name: 'rant-reply',
    convo: `oracle: before any cards: what's been taking up room in your head lately? don't organize it. just talk.\nvisitor: ha okay. i moved to reno in march for a lighting design job my whole family thinks is insane because i left teaching, with a PENSION, and the job is actually great? but every sunday i call my mom and by the end i'm apologizing for being happy. that can't be normal.`,
    assignment: `beat: tissue\naccomplish: receive the rant; land on the one live thing without pressing yet\nfamiliarity: level 0 — you don't know this person at all; you have no right to a read yet\ncap 10 words.`,
  },
  {
    name: 'card-read',
    convo: `visitor: yeah. the sunday call is a toll booth. anyway. cards?\noracle: [the deal happened; first card turned]`,
    assignment: `beat: read\naccomplish: read the flipped card against them\nthe position's job: the loop itself\nthe card's imagery: a figure turning a wheel that lifts and lowers riders; its charge: what repeats because you feed it\nfamiliarity: level 2 — you have a shape of them: the sunday toll, the happiness apology, the family verdict on leaving\nplain beats poetic. one image max. end with a handle. up to 34 words.`,
  },
  {
    name: 'cold-guess-recovery',
    convo: `oracle: are you the kind of person who left town so you could finally be bad at something in private?\nvisitor: no. honestly that's not it at all. i love being watched, that's the embarrassing part.`,
    assignment: `beat: tissue\naccomplish: take the miss gracefully, bank the correction ("loves being watched"), and stay curious — no retreat into flattery\nfamiliarity: level 1 — an inkling, freshly corrected\ncap 14 words.`,
  },
];

async function main() {
  const key = readFileSync('.env.local', 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m)![1]!.trim();
  const adapter = new AnthropicAdapter(createClaudeClient(key));
  for (const [pname, system] of Object.entries(PERSONAS)) {
    console.log(`\n════ ${pname} ════`);
    for (const m of MOMENTS) {
      const out = await adapter.invokeStreaming(
        {
          system,
          user: `[the conversation so far]\n${m.convo}\n\n[your orientation]\n(discovery posture)\n\n[the intent]\n${m.assignment}`,
          tool: PERSONA_TOOL,
          model: 'cognition',
          max_tokens: 500,
        },
        PersonaLineSchema,
      );
      console.log(`  [${m.name}]`);
      console.log(`    too_far:  ${out.too_far}`);
      console.log(`    SPOKEN:   ${out.spoken}`);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
