// Mascot lines delivered when a returning user confirms RESUME.
//
// Canned, lowercase, in the cat's voice. Kept short — the dialogue line
// component types them out, so length is felt. Pick one at random; UI
// supplies the name (or undefined for anonymous warmth).
//
// Iterate the copy freely. The contract is the function signature.

const TEMPLATES_WITH_NAME = [
  (name: string) => `${name}. again.`,
  (name: string) => `${name}. the cards remember you.`,
  (name: string) => `back so soon, ${name}?`,
  (name: string) => `${name}. sit. let's see what's new.`,
];

const TEMPLATES_ANON = [
  () => `you're back.`,
  () => `the cards remember you.`,
  () => `again. good.`,
  () => `didn't think i'd see you so soon.`,
];

export const RETURN_LINES = { TEMPLATES_WITH_NAME, TEMPLATES_ANON } as const;

/** Pick a random return line. Pass the user's name to allow name-aware
 *  variants; pass undefined for anonymous lines (rarely needed since we
 *  always have at least Q1 name by the time this fires). */
export function pickReturnLine(name?: string): string {
  if (name && name.trim().length > 0) {
    const cleaned = name.trim().toLowerCase();
    const pick = TEMPLATES_WITH_NAME[Math.floor(Math.random() * TEMPLATES_WITH_NAME.length)]!;
    return pick(cleaned);
  }
  const pick = TEMPLATES_ANON[Math.floor(Math.random() * TEMPLATES_ANON.length)]!;
  return pick();
}
