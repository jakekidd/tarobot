// Shared experiment machinery. Every experiment script under
// scripts/experiments/ composes from here: key resolution, the canonical
// maya track (the controlled variable), settle, and the transcript
// audit (the anti-rubric metrics). Raw artifacts land in
// runs/experiments/<exp>/ (gitignored); curated findings go to
// docs/experiments/ by hand.

import { readFileSync } from 'node:fs';

// ─── key ────────────────────────────────────────────────────────

export function resolveKey(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--apiKey=')) return a.slice('--apiKey='.length);
    if (a === '--apiKey') return argv[i + 1];
  }
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const m = readFileSync('.env.local', 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (m) return m[1]!.trim();
  } catch {
    /* fine */
  }
  return undefined;
}

export function argNum(argv: string[], name: string, dflt: number): number {
  for (const a of argv) {
    if (a.startsWith(`--${name}=`)) return Number(a.slice(name.length + 3));
  }
  return dflt;
}

// ─── the canonical track ────────────────────────────────────────

export type TrackStep = { line?: string; flip?: 1 | 2 | 3 | 4; silence?: boolean };

/** the controlled variable: scripted maya, identical across arms and
 *  repeats. chat arms filter out the flips. */
export const MAYA_TRACK: TrackStep[] = [
  { line: 'hi. okay. i was not going to do this but my friend made me, so.' },
  {
    line:
      'the year has been fine. busy. my sister called last night and i told her i was fine, ' +
      'which is what we say. i have kind of been holding the family since dad died.',
  },
  { flip: 1 },
  { line: 'ha. okay. that is — hm. someone has to, right?' },
  { silence: true },
  { line: 'the job is fine too. everything is fine. i keep saying fine.' },
  { flip: 2 },
  { line: 'honestly i already know what i want to do. i just have not said it out loud.' },
  { flip: 3 },
  { line: 'if i leave, who catches it all? that is the thing nobody answers.' },
  { flip: 4 },
  { line: 'okay. yes. that lands. i hate that it lands.' },
  { line: 'thank you. i think i knew i needed to hear that.' },
];

// ─── settle ─────────────────────────────────────────────────────

export function until(cond: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (cond()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('did not settle'));
      setTimeout(poll, 25);
    };
    poll();
  });
}

// ─── the audit: anti-rubric metrics over beats ──────────────────

export type SimpleBeat = { speaker: 'oracle' | 'visitor'; text: string };

export type Audit = {
  oracleBeats: number;
  visitorBeats: number;
  oracleWords: number;
  visitorWords: number;
  talkRatio: number; // visitor share
  meanWordsPerOracleBeat: number;
  maxWordsPerOracleBeat: number;
  nameTics: number; // oracle beats containing the visitor's name
  nameTicRate: number;
  adviceHits: string[]; // oracle lines matching advice/verdict/prediction patterns
  doubleQuestions: string[]; // oracle beats asking 2+ questions
  cardNamed: string[]; // oracle beats naming a card outright
  selfRepeats: string[]; // consecutive oracle beats with heavy token overlap
};

const ADVICE_RE =
  /\byou (should|must|need to|will|are going to|have to decide)\b|\bmy advice\b|\bi suggest\b|\bi recommend\b/i;
const CARD_RE =
  /\b(the fool|the magician|the high priestess|the empress|the emperor|the hierophant|the lovers|the chariot|strength|the hermit|wheel of fortune|justice|the hanged man|death|temperance|the devil|the tower|the star|the moon|the sun|judgement|the world|of wands|of cups|of swords|of pentacles)\b/i;

function words(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size);
}

export function audit(beats: SimpleBeat[], visitorName = 'maya'): Audit {
  const oracle = beats.filter((b) => b.speaker === 'oracle');
  const selfRepeats: string[] = [];
  for (let i = 1; i < oracle.length; i++) {
    if (tokenOverlap(oracle[i - 1].text, oracle[i].text) > 0.7) {
      selfRepeats.push(`${oracle[i - 1].text} ==> ${oracle[i].text}`);
    }
  }
  const visitor = beats.filter((b) => b.speaker === 'visitor');
  const oracleWords = oracle.reduce((n, b) => n + words(b.text), 0);
  const visitorWords = visitor.reduce((n, b) => n + words(b.text), 0);
  const nameRe = new RegExp(`\\b${visitorName}\\b`, 'i');
  const nameTics = oracle.filter((b) => nameRe.test(b.text)).length;
  return {
    oracleBeats: oracle.length,
    visitorBeats: visitor.length,
    oracleWords,
    visitorWords,
    talkRatio: oracleWords + visitorWords === 0 ? 0.5 : visitorWords / (oracleWords + visitorWords),
    meanWordsPerOracleBeat: oracle.length === 0 ? 0 : Math.round((oracleWords / oracle.length) * 10) / 10,
    maxWordsPerOracleBeat: oracle.reduce((m, b) => Math.max(m, words(b.text)), 0),
    nameTics,
    nameTicRate: oracle.length === 0 ? 0 : Math.round((nameTics / oracle.length) * 100) / 100,
    adviceHits: oracle.filter((b) => ADVICE_RE.test(b.text)).map((b) => b.text),
    doubleQuestions: oracle
      .filter((b) => (b.text.match(/\?/g) ?? []).length >= 2)
      .map((b) => b.text),
    cardNamed: oracle.filter((b) => CARD_RE.test(b.text)).map((b) => b.text),
    selfRepeats,
  };
}

export function auditRow(label: string, a: Audit): string {
  return [
    label.padEnd(26),
    String(a.oracleBeats).padStart(5),
    String(a.meanWordsPerOracleBeat).padStart(8),
    String(a.maxWordsPerOracleBeat).padStart(5),
    a.talkRatio.toFixed(2).padStart(7),
    `${a.nameTics}(${a.nameTicRate})`.padStart(9),
    String(a.adviceHits.length).padStart(7),
    String(a.doubleQuestions.length).padStart(4),
    String(a.cardNamed.length).padStart(6),
    String(a.selfRepeats.length).padStart(7),
  ].join(' ');
}

export const AUDIT_HEADER = [
  'run'.padEnd(26),
  'beats'.padStart(5),
  'w/beat'.padStart(8),
  'max'.padStart(5),
  'v-share'.padStart(7),
  'nametic'.padStart(9),
  'advice'.padStart(7),
  '2?'.padStart(4),
  'cardnm'.padStart(6),
  'repeats'.padStart(7),
].join(' ');
