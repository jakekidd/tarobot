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


const PERSONAS: Record<string, string> = { vesper: WILDCARD };

const MOMENTS = [
  {
    name: 'rant-reply',
    convo: `oracle: before any cards: what's been taking up room in your head lately? don't organize it. just talk.\nvisitor: ha okay. i moved to reno in march for a lighting design job my whole family thinks is insane because i left teaching, with a PENSION, and the job is actually great? but every sunday i call my mom and by the end i'm apologizing for being happy. that can't be normal.`,
    assignment: `beat: tissue\naccomplish: receive the rant; land on the one live thing\nfamiliarity: level 0/4 — a stranger\nlicense: clarify — questions and small acknowledgments only; no reads\ncap 14 words.`,
  },
  {
    name: 'card-read',
    convo: `visitor: yeah. the sunday call is a toll booth. anyway. cards?\noracle: [the deal happened; first card turned]`,
    assignment: `beat: read\naccomplish: read the flipped card against them\nthe position's job: the loop itself\nthe card's imagery: a figure turning a wheel that lifts and lowers riders; its charge: what repeats because you feed it\nfamiliarity: level 3/4 — you know what this is about\nlicense: synthesize — a logline of THEIR material may be handed back\nplain speech. end with a handle. up to 30 words.`,
  },
  {
    name: 'cold-guess-recovery',
    convo: `oracle: are you the kind of person who left town so you could finally be bad at something in private?\nvisitor: no. honestly that's not it at all. i love being watched, that's the embarrassing part.`,
    assignment: `beat: tissue\naccomplish: bank the correction ("loves being watched") and get the next clarifying question out\nfamiliarity: level 1/4 — an inkling, freshly corrected\nlicense: clarify — questions and small acknowledgments only\ncap 14 words.`,
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
