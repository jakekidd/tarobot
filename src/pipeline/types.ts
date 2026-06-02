// Pipeline-wide types. Pure types only — no React, no DOM.

// ─── Antechamber ─────────────────────────────────────────────

export type AntechamberAnswer = {
  question_id: string;
  picked: string[];           // multi-select supports >1; single-pick = [option]
  passed?: boolean;           // user tapped "pass" on a dark question
};

export type Antechamber = {
  answers: AntechamberAnswer[];
  started_at: number;
  ended_at?: number;
};

export type PillarQuestionFormat = 'binary' | 'choice' | 'matrix-2x2' | 'multi-select';

export type PillarQuestion = {
  id: string;
  text: string;
  /** Optional short cat-voice preface that prints above the question text. */
  lead_in?: string;
  format: PillarQuestionFormat;
  options: string[];
  axes?: { x: [string, string]; y: [string, string] };
  category:
    | 'identity' | 'life-state' | 'relational'
    | 'register' | 'projective' | 'stance' | 'time';
  depth: 'warm' | 'medium' | 'edge';
  tags: string[];
  interpretation: Record<string, string>;
};

// ─── Choice (unified — replaces ChoiceCandidate + TargetChoice) ─

export type ChoiceSource = 'stated' | 'inferred' | 'constructed';

export type Choice = {
  id: string;
  description: string;
  options: { name: string; summary?: string }[];
  source: ChoiceSource;
  scores: {
    stakes: number;             // 1-5
    time_proximity: number;     // 1-5
    user_engagement: number;    // 1-5
  };
  // upgraded fields — populated when cognition flags this as the target
  stakes?: string;
  time_horizon?: 'weeks' | 'months' | 'year+';
  blindspots?: string[];
  is_target: boolean;
  confidence: number;            // 0-1
  notes: string;
};

// ─── Profile blobs (cognition's scratchpads + persona-facing brief) ─

export type CastEntry = {
  role: string;                  // "ex-partner", "absent figure"
  name?: string;                 // only if user gave it
  valence: string;               // free-form, e.g. "unresolved"
  last_referenced_turn: number;
};

export type Thread = {
  pattern: string;               // "describes work and ex as 'fine'"
  observations: number[];        // turn indices
  salience: number;              // 1-5
};

export type Hunch = {
  suspicion: string;
  grounded_in: string;
  confidence: number;            // 0-1
  age_turns: number;
};

export type Highlight = {
  id: string;
  topic: string;
  reason: string;                // why it's on cognition's mind
  introduced_turn: number;
  ttl: number;                   // decrements on transcript update; <=0 = drop
  salience: 'low' | 'medium' | 'high';
};

// ─── Profile (the growing blob) ─────────────────────────

// (ClatNote removed — vestigial from the legacy Compiler-era pipeline,
// no consumers. New survey notes live on AntechamberProfile.sections.)

export type Profile = {
  identity: {
    name?: string;
    /** Legacy: kept for back-compat with older sessions. Prefer birth_date. */
    birth_month_day?: string;
    /** Full ISO "YYYY-MM-DD" if year was given. */
    birth_date?: string;
    sun_sign?: string;            // derived from the date in compile()
    life_path?: number;           // numerological life path; 11/22/33 are master numbers
    tarot_birth_card?: {
      number: number;             // 0-21 Major Arcana
      name: string;
    };
    came_with?: string;
    notes: string;                // freeform identity-related notes
  };

  // running candidates; the leading one has is_target=true
  candidates: Choice[];

  // cognition's blobs — persona NEVER sees these directly
  cast: CastEntry[];
  threads: Thread[];
  hunches: Hunch[];
  margin: string;                // freeform observations, ~500ch soft cap
  cognition_log: string;          // cognition's private journal, ~2000ch soft cap

  // attention pointers (cognition curates; persona feels them via brief)
  highlights: Highlight[];

  // the ONLY thing persona reads about who this person is
  brief: string;                  // 3-6 sentences, natural prose, <500 words

  // ── Observer-produced texture (forwarded by assembleProfile) ──
  // The survey observer agent writes these end-of-antechamber. The seer's
  // director consumes them as adjunct context to the structural story
  // and hypothesis ladder — the observer fields carry HOW the subject
  // comes across, the gap between performed and lived self, the wound
  // behind the value. Optional so callers that build Profile manually
  // (e.g. read demo) don't need to populate them.
  observer_body?: string;         // 9-section markdown psychological doc
  observer_hooks?: string[];      // verbatim phrases the seer can echo
  observer_edges?: string[];      // growth surface — what the subject almost-knows
  observer_side_channel?: {
    signals?: string;
    patterns?: string;
    contradictions?: string;
    avoidances?: string;
  };

  ready_to_close: boolean;        // cognition raises when target is solid
  version: number;                // bumps each profile update
};

// ─── Question (the unit cognition emits, persona renders) ─

export type Question = {
  id: string;
  prompt: string;                 // raw — persona may paraphrase
  options: string[];              // exactly 4 (hard rule)
  responses: string[];            // pre-baked tarobot reaction per option, same length as options
  fork_lead?: string;             // candidate id this Q is targeting, optional
  depth: 'warm' | 'medium' | 'edge';
  meta: {
    based_on_profile_version: number;
    rationale: string;            // for debug
  };
};

// ─── Transcript (append-only; lines may carry hindsight marginalia) ─

export type Speaker = 'persona' | 'user';

export type TranscriptLine = {
  turn: number;
  speaker: Speaker;
  content: string;                 // what was actually said/picked
  question_id?: string;            // if this line was a Q delivery
  picked_index?: number;           // if this line was a user pick
  thoughts: string[];              // appended hindsight (cognition's marginalia)
};

// ─── Engine state (what the orchestrator threads) ─────

export type PersonaAnimation =
  | 'neutral' | 'narrow' | 'widen' | 'closed' | 'glance_aside';

export type EngineState = {
  survey: Antechamber;
  profile: Profile;
  transcript: TranscriptLine[];
  question_queue: Question[];      // 1-3 deep
  current_question: Question | null; // the one currently shown to user
  current_animation: PersonaAnimation;
  turn_count: number;
  closed: boolean;                 // engine stops when true (manual quit only in MVP)
};

// ─── Cards / Spreads / Reading (untouched — for tarot phase later) ─

export type Arcana = 'major' | 'minor';
export type Suit = 'cups' | 'wands' | 'swords' | 'pentacles';

export type Card = {
  id: number;
  name: string;
  arcana: Arcana;
  suit?: Suit;
  number?: number;
  keywords: string[];
  upright_meaning: string;
};

export type SpreadPositionLayout = {
  x: number; y: number; z?: number; rotation?: number;
};

export type SpreadPosition = {
  id: string;
  role: string;
  prompt_label: string;
  layout: SpreadPositionLayout;
};

export type Spread = {
  id: string;
  name: string;
  description: string;
  positions: SpreadPosition[];
};

export type DrawnCard = { position: SpreadPosition; card: Card };
export type DrawnCards = { spread: Spread; cards: DrawnCard[] };

export type Chapter = {
  position_id: string;
  card_id: number;
  role_in_arc: string;
  hooks_used: string[];
  prediction: string;
  spoken_text: string;
};

export type Reading = {
  theme: string;
  arc: string;
  chapters: Chapter[];
  closing_text: string;
};
