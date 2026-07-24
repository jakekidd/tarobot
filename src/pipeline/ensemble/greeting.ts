// The greeting — the scripted opening speech. Screenwritten, not
// generated: the opening is where an unfounded model line costs the most
// (live finding: "they have been waiting this long", claimed knowledge
// the room never gave it). Templates live in materials/ensemble/ and are
// spoken verbatim; personalization is slot-filling, never invention.

export type GreetingVars = { name?: string };

/** Render a greeting template into beats: html comments are authoring
 *  notes (stripped), paragraphs are beats, and any line carrying an
 *  unfillable {{name}} slot is dropped whole. */
export function renderGreeting(template: string, vars: GreetingVars): string[] {
  const stripped = template.replace(/<!--[\s\S]*?-->/g, '');
  const beats: string[] = [];
  for (const block of stripped.split(/\n\s*\n/)) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .flatMap((l) => {
        if (!l.includes('{{name}}')) return [l];
        if (!vars.name) return [];
        return [l.replaceAll('{{name}}', vars.name)];
      });
    const beat = lines.join(' ').trim();
    if (beat) beats.push(beat);
  }
  return beats;
}
