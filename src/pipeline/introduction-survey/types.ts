// IntroductionSurvey data model. No React, no DOM, no model SDK — this is
// backend-portable business logic. The survey is deterministic: it asks
// facet questions, records picks, and rounds everything up into a
// RawPortrait. No AI runs here, ever.

/** The five authored claim/relation channels every survey option carries.
 *  Three are claims about the person (indicator = fact, implication = lead,
 *  identity = competing character-hypothesis); two are non-person channels
 *  (hooks = pairwise/relational, notes = directive). The two flatten-time
 *  scalars — `weight` and `shadow` — live on the option but not here.
 *  Authored in materials/survey.json. */
export type Channels = {
  indicators: string[];
  implications: string[];
  identities: string[];
  hooks: string[];
  notes: string[];
};

export const EMPTY_CHANNELS: Channels = {
  indicators: [],
  implications: [],
  identities: [],
  hooks: [],
  notes: [],
};

/** One answered facet, captured for the RawPortrait. Carries the chosen
 *  option's weight (the amalgam sort key) and the shadows of the DECLINED
 *  options that ran hot enough to matter — the legible negative space. */
export type FacetReading = {
  slug: string;
  facet: string;
  question: string;
  hidden_target: string | null;
  /** The chosen option label, or the user's typed free-text. */
  chosen: string;
  /** True when `chosen` was typed rather than picked from the options. */
  free_text: boolean;
  /** 0-3 — the chosen option's weight. The amalgam's sort key. */
  weight: number;
  /** Options shown but not chosen. */
  declined: string[];
  /** The chosen option's authored channels (empty for free-text). */
  channels: Channels;
  /** A shadow line from EVERY declined option — what each omission means.
   *  Nothing dropped; weight sorts in the amalgam, fidelity comes first. */
  shadows: string[];
  answered_at: number;
  latency_ms: number;
};

/** Identity facts gathered outside the choice facets. The name (with the
 *  accent color the player picked for it) and everything the birthdate
 *  yields. These personalize and date the portrait but must NOT bias the
 *  facet reads — a name can be nonsense, which is why name carries no
 *  channels and no weight. */
export type IdentityBlock = {
  name: string;
  name_color: string;
  birthday: { year: number; month: number; day: number } | null;
  sun_sign: string | null;
  life_path: number | null;
  birth_card: { number: number; name: string } | null;
  age_bracket: string | null;
  /** Mirror of the relationship-status facet pick. Null until answered. */
  relationship_status: string | null;
};

/** Every channel flattened across all facets, ordered by source weight (hot
 *  first), plus the shadows of every declined option. Weight sorts (high
 *  signal rises); nothing is gated or dropped — the amalgam is a faithful,
 *  lossless, pre-ranked reflection of the picked answers. */
export type Amalgam = {
  indicators: string[];
  implications: string[];
  identities: string[];
  hooks: string[];
  notes: string[];
  shadows: string[];
};

/** The IntroductionSurvey's entire deterministic output — and the
 *  TuningEngine's raw input. The identity block, every facet reading in
 *  collection order, and the weight-ranked amalgam. The TuningEngine paints
 *  the *Portrait* (a light vignette profile) from this as its first step;
 *  this object itself is unpainted. */
export type RawPortrait = {
  identity: IdentityBlock;
  facets: FacetReading[];
  amalgam: Amalgam;
  /** Reserved. Where this person reads as an outlier vs. baseline — computed
   *  once option base-rates exist (next pass). Empty for now. */
  deviations: string[];
  collected_at: number;
};
