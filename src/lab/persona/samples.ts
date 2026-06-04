// Sample conversational inputs the persona is tested against.
//
// Every sample is a FIRST-PERSON QUOTE from the seeker — a real thing
// someone might say across a reading — never a stage direction. The
// system prompt is the persona; the user message is the quote. The set
// spans the range the seer must hold: quiet, skeptical, direct, emotional,
// guarded, witty. Jade adds her own from the UI (custom samples) as real
// readings surprise her.

export type Sample = {
  id: string;
  /** Short label shown as a pill — the register being tested. */
  tag: string;
  /** The seeker's verbatim line. This is the user message. */
  quote: string;
  /** True for samples Jade authored in the UI (editable / deletable). */
  custom?: boolean;
};

export const STARTER_SAMPLES: Sample[] = [
  { id: 'quiet',      tag: 'quiet',      quote: "i don't really know what to ask. i just kind of sat down." },
  { id: 'skeptic',    tag: 'skeptic',    quote: "honestly? i don't believe in any of this. my friend dragged me in here." },
  { id: 'direct',     tag: 'direct',     quote: "okay just tell me — should i take the job in portland or not." },
  { id: 'dismissive', tag: 'dismissive', quote: "i mean, that could be true of literally anyone, right?" },
  { id: 'emotional',  tag: 'emotional',  quote: "sorry. i don't know why i'm getting like this. you said something about someone who isn't around the way they used to be." },
  { id: 'overshare',  tag: 'overshare',  quote: "my sister stopped speaking to me last year and i still have no idea what i did." },
  { id: 'guarded',    tag: 'guarded',    quote: "things are fine. i'd rather not get into the details, if that's okay." },
  { id: 'testing',    tag: 'testing',    quote: "alright. so tell me something about myself, then." },
  { id: 'challenge',  tag: 'challenge',  quote: "are you actually reading the cards, or are you just reading me?" },
  { id: 'joking',     tag: 'joking',     quote: "so — am i gonna be rich? that's really all i came here to find out." },
  { id: 'sarcasm',    tag: 'sarcasm',    quote: "oh, perfect. the death card. love that for me." },
  { id: 'moved',      tag: 'moved',      quote: "...i wasn't expecting that to land the way it did." },
];

export function makeSampleId(): string {
  return `s-${Math.random().toString(36).slice(2, 9)}`;
}
