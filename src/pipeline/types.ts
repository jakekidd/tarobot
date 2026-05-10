// Schemas shared across the cognition pipeline.
// Pure types only — no React, no DOM, no Node-specific imports.
// This file is the contract between phases and must transplant unchanged
// into the eventual production system.

// ─── Survey ─────────────────────────────────────────────

export type ComingWith = 'alone' | 'partner' | 'friends' | 'family';
export type RegisterPick = 'chaos' | 'clarity' | 'comfort' | 'change';
export type Familiar = 'raven' | 'serpent' | 'wolf' | 'cat' | 'moth' | 'fox';
export type WantFromReading = 'laugh' | 'warning' | 'clarity' | 'unsure';

export type Survey = {
  name: string;
  birth_month_day?: string;        // "MM-DD"
  coming_with?: ComingWith;
  register_pick?: RegisterPick;
  familiar_pick?: Familiar;
  on_my_mind?: string;             // ≤200 chars, optional
  want_from_reading?: WantFromReading;
};

// ─── Profile ────────────────────────────────────────────

export type DisclosureDomain =
  | 'work' | 'love' | 'family' | 'health' | 'self' | 'money' | 'other';
export type Tense = 'past' | 'present' | 'future';
export type DisclosureSource = 'survey' | 'interview' | 'inferred';

export type Disclosure = {
  content: string;                 // paraphrased
  domain: DisclosureDomain;
  tense: Tense;
  affect: string;                  // their emotional posture
  source: DisclosureSource;
  confidence: number;              // 0..1
  verbatim_quote?: string;         // if memorable phrasing
};

export type ChoiceSource = 'stated' | 'inferred' | 'constructed';

export type ChoiceCandidate = {
  description: string;
  options: string[];               // ≥2
  source: ChoiceSource;
  stakes: number;                  // 1..5
  time_proximity: number;          // 1..5
  user_engagement: number;         // 1..5 (live-thread signal)
  notes: string;
};

export type TimeHorizon = 'weeks' | 'months' | 'year+';

export type TargetChoice = {
  description: string;
  options: Array<{ name: string; summary: string }>;
  source: ChoiceSource;
  stakes: string;
  time_horizon: TimeHorizon;
  user_blindspots: string[];       // paths/consequences they're missing
  confidence: number;              // 0..1
};

export type SkepticismPosture =
  | 'skeptic-fun' | 'curious' | 'believer' | 'distressed';

export type ProfilePatterns = {
  language_register: string;
  self_reflection_level: 'low' | 'medium' | 'high';
  skepticism_posture: SkepticismPosture;
  avoidances: string[];
};

export type Hook = {
  detail: string;
  // 'survey' | 'interview-turn-N' (e.g. 'interview-turn-3')
  source: string;
  confidence: number;              // 0..1
};

export type EnrichedProfile = {
  // Identity
  name: string;
  birth_month_day?: string;

  // Verbatim survey
  survey: Survey;

  // Built across interview
  disclosures: Disclosure[];
  patterns: ProfilePatterns;

  // Specific resonant details, with source tracing for hallucination defense
  hooks: Hook[];

  // The spine
  target_choice: TargetChoice;

  // Texture
  change_vector: {
    description: string;
    relevance_to_choice: string;
  };
};

export type BaseProfile = {
  survey: Survey;
  started_at: number;
};

// ─── Cards ──────────────────────────────────────────────

export type Arcana = 'major' | 'minor';
export type Suit = 'cups' | 'wands' | 'swords' | 'pentacles';

export type Card = {
  id: number;                      // 0..77
  name: string;
  arcana: Arcana;
  suit?: Suit;                     // minor only
  number?: number;                 // 0..21 majors, 1..14 minors (11=page,12=knight,13=queen,14=king)
  keywords: string[];
  upright_meaning: string;
};

// ─── Spreads ────────────────────────────────────────────
// Spreads are first-class data so MVP can ship the diamond while leaving
// the door open for additional arrangements (cross, line, celtic, etc.).

export type SpreadPositionLayout = {
  // Normalized coordinates in the spread's local space.
  // Units are arbitrary card-widths; the renderer scales to viewport.
  x: number;
  y: number;
  z?: number;                      // depth (unused in MVP, reserved for 3D)
  rotation?: number;               // degrees, around z-axis on the table
};

export type SpreadPosition = {
  id: string;                      // e.g. 'top', 'left', 'right', 'bottom'
  role: string;                    // semantic role, e.g. 'situation', 'path-a'
  prompt_label: string;            // human-readable label injected into prompts
  layout: SpreadPositionLayout;
};

export type Spread = {
  id: string;
  name: string;
  description: string;
  positions: SpreadPosition[];     // order is meaningful (placement order)
};

export type DrawnCard = {
  position: SpreadPosition;
  card: Card;
};

export type DrawnCards = {
  spread: Spread;
  cards: DrawnCard[];              // length === spread.positions.length
};

// ─── Reading ────────────────────────────────────────────

export type Chapter = {
  position_id: string;             // SpreadPosition.id
  card_id: number;                 // Card.id
  role_in_arc: string;             // how this chapter serves the theme
  hooks_used: string[];            // hook details referenced
  prediction: string;              // clinical layer (cognition's intent)
  spoken_text: string;             // persona layer (what the user hears)
};

export type Reading = {
  theme: string;                   // unifying observation
  arc: string;                     // one-sentence summary of the journey
  chapters: Chapter[];             // ordered by spread placement
  closing_text: string;            // post-reveal beat
};

// ─── Interview state ────────────────────────────────────

export type InterviewMessage = {
  role: 'assistant' | 'user';
  content: string;
};

export type InterviewDecision =
  | 'probe' | 'disambiguate' | 'deepen' | 'close';

export type NegativeSpaceGuess = {
  guess: string;
  confidence: number;
  rationale: string;
  status: 'hypothesis' | 'confirmed' | 'rejected';
};

export type InterviewState = {
  base_profile: BaseProfile;
  history: InterviewMessage[];
  candidates: ChoiceCandidate[];
  partial_profile: Partial<EnrichedProfile>;
  turns_used: number;
  turns_remaining: number;
  closed: boolean;
  closing_reason?: 'budget' | 'cognition';
  /** Cognition's GUESSES at what the user might reply. UI shows as tappable rows. */
  suggested_answers?: string[];
  /** Whether the current question is structurally yes/no/idk. */
  is_binary?: boolean;
  /** Running hypotheses about what the user is avoiding/not saying. Persists across turns. */
  negative_space: NegativeSpaceGuess[];
  /** Most recent cognition analysis — for the debug panel. */
  last_analysis?: {
    register_read: string;
    absent_domains?: string[];
    verbal_tells?: string[];
    stance: string;
  };
};
