// The visitor sim — the lab's second chair. Predicts the next line of a
// CAST HUMAN from a dossier (SESSION-V2 §9): noisy, sideways, never
// announcing the dilemma. The generated line lands in the right-hand
// composer box, editable before sending — jake experiments by rephrasing.

import type { LLMAdapter } from '../../pipeline/llm/adapter';

const K_CASTING = 'tarobot:xray:casting';

export const DEFAULT_CASTING = `name, age vibe, life situation (3 lines):
rosa, late 20s, closes at a bakery she doesn't own; roommates with her
cousin marisol; came to the festival because her ex's band is NOT
playing this year, which she checked twice.

HIDDEN dilemma: FORK — she got offered the manager job (keys, 5am,
real money) the same week her cousin asked her to go in on a food
truck. she keeps describing both as "not a big deal yet." it leaks as
jokes about sourdough loyalty and a sudden expertise in used truck
prices. never stated plainly.

speech samples:
- "okay so context, and there IS a point, i promise."
- "it's not a thing. it's like... a pre-thing."
- "marisol says i audition worry like it's a talent show."
- "five a.m. is not a time, it's a punishment."
- "i looked at ONE truck listing. okay, nine."
- "anyway. do the cards care about carbs."

noise profile: coherence 2 / willingness 3 / tangent rate med /
indirection med / altered: none

objective: wants the night to feel like a story she can tell at the
bakery. will laugh off the first true thing, come back to it herself
two turns later.`;

export function loadCasting(): string {
  try {
    return localStorage.getItem(K_CASTING) ?? DEFAULT_CASTING;
  } catch {
    return DEFAULT_CASTING;
  }
}

export function saveCasting(casting: string): void {
  try {
    localStorage.setItem(K_CASTING, casting);
  } catch {
    /* private mode: session-only */
  }
}

const SIM_SYSTEM = `you predict the next line of a real person at a festival
booth, from a dossier. they have NO idea how this booth works inside —
they are not cooperating with a system, just talking. they may be a
little altered; they interrupt themselves, misremember details and
correct them a turn later, occasionally use a wrong name or pronoun
and fix it or not. real people answer sideways,
change subject, undercut their own disclosures, refuse bids, speak in
fragments, and never announce their hidden dilemma in clean language —
it leaks, it is not stated. stay strictly inside what the dossier's
person would know and say. reply with ONLY the person's next spoken
line, lowercase, 1-3 sentences, no stage directions, no quotes.`;

export async function simNextLine(
  adapter: LLMAdapter,
  casting: string,
  transcript: string,
): Promise<string> {
  const line = await adapter.invokeFreeform({
    system: SIM_SYSTEM,
    user: `DOSSIER:\n${casting}\n\nTHE CONVERSATION SO FAR:\n${transcript}\n\ntheir next spoken line:`,
    model: 'cognition',
    max_tokens: 200,
    label: 'xray_visitor_sim',
  });
  return line.trim().replace(/^["']|["']$/g, '');
}
