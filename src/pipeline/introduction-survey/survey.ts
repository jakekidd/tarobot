// IntroductionSurvey — the first thing that drives the experience.
//
// A deterministic, AI-free walk through the facet questions. It implements
// RailDriver, so the UI renders it without knowing it's a survey (and a
// server could host it later without the UI noticing). It runs no agents,
// holds no model SDK, and touches no DOM. It does not even read the file
// system — it's handed a validated SurveyDoc, so it stays pure and Node-
// testable (the loader is a separate, Vite-coupled concern).
//
// Flow:  name  →  facet[0..n-1]  →  birthdate  →  done
//   - name is special: first, personalization-only, carries NO channels and
//     NO weight (a name can be nonsense; it must not bias the reads).
//   - facets come from the SurveyDoc, in order.
//   - birthdate is special: always LAST; it yields age + astro, not channels.
//
// On `done`, it rounds everything up into a RawPortrait: every facet reading
// in collection order, plus a weight-ranked amalgam (hot conclusions first).
// FIDELITY RULE: weight only SORTS — it never filters or drops. Everything
// authored in survey.json for the picked answers (and the declined options'
// shadows) shows up. The amalgam is a lossless, pre-ranked reflection of the
// doc, nothing silently removed.

import type { RailDriver, RailStep, RailInput } from '../rails/types';
import { computeAstroProfile, parseBirthDate } from '../astrology';
import type { SurveyDoc, SurveyFacet } from './schema';
import {
  EMPTY_CHANNELS,
  type Amalgam,
  type Channels,
  type FacetReading,
  type IdentityBlock,
  type RawPortrait,
} from './types';

type Position =
  | { kind: 'name' }
  | { kind: 'facet'; index: number }
  | { kind: 'birthdate' }
  | { kind: 'done' };

/** One-level undo snapshot — survey state at the moment an answer was given.
 *  Only the most recent is kept; undo restores it and forgets it. */
type Snapshot = {
  pos: Position;
  name: string;
  nameColor: string;
  birthday: IdentityBlock['birthday'];
  sunSign: string | null;
  lifePath: number | null;
  birthCard: IdentityBlock['birth_card'];
  ageBracket: string | null;
  readings: FacetReading[];
};

export class IntroductionSurvey implements RailDriver<RawPortrait> {
  private readonly facets: SurveyFacet[];
  private readonly listeners = new Set<() => void>();
  private pos: Position = { kind: 'name' };
  /** When the current step became active — for per-facet latency. */
  private shownAt = Date.now();

  // collected identity
  private name = '';
  private nameColor = '';
  private birthday: IdentityBlock['birthday'] = null;
  private sunSign: string | null = null;
  private lifePath: number | null = null;
  private birthCard: IdentityBlock['birth_card'] = null;
  private ageBracket: string | null = null;

  private readings: FacetReading[] = [];
  private finished: RawPortrait | null = null;
  /** Most-recent pre-answer snapshot for one-level undo (facets only). */
  private prevSnapshot: Snapshot | null = null;

  constructor(doc: SurveyDoc) {
    this.facets = doc.facets;
  }

  // ─── RailDriver ──────────────────────────────────────

  current(): RailStep {
    switch (this.pos.kind) {
      case 'name':
        return { kind: 'name' };
      case 'facet': {
        const f = this.facets[this.pos.index]!;
        return {
          kind: 'choice',
          slug: f.slug,
          prompt: f.question,
          options: f.options.map((o) => o.label),
        };
      }
      case 'birthdate':
        return { kind: 'birthdate' };
      case 'done':
        return { kind: 'done' };
    }
  }

  submit(input: RailInput): void {
    const answeredAt = Date.now();
    const latency = answeredAt - this.shownAt;

    switch (this.pos.kind) {
      case 'name':
        if (input.kind !== 'name') return;
        this.name = input.name.trim();
        this.nameColor = input.color;
        break;
      case 'facet':
        if (input.kind !== 'choice') return;
        this.prevSnapshot = this.snapshot();
        this.recordFacet(this.facets[this.pos.index]!, input.value, latency, answeredAt);
        break;
      case 'birthdate':
        if (input.kind !== 'birthdate') return;
        this.recordBirthdate(input.iso);
        break;
      case 'done':
        return;
    }

    this.advance();
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  result(): RawPortrait | null {
    return this.finished;
  }

  // ─── undo (one level, facets only) ───────────────────

  /** True when the last facet answer can be taken back. Disabled once the
   *  survey is done — you can't undo past the final question. */
  canUndo(): boolean {
    return this.prevSnapshot !== null && this.pos.kind !== 'done';
  }

  /** Restore the most-recent pre-answer snapshot, then forget it (one level). */
  undo(): void {
    const s = this.prevSnapshot;
    if (!s || this.pos.kind === 'done') return;
    this.pos = s.pos;
    this.name = s.name;
    this.nameColor = s.nameColor;
    this.birthday = s.birthday;
    this.sunSign = s.sunSign;
    this.lifePath = s.lifePath;
    this.birthCard = s.birthCard;
    this.ageBracket = s.ageBracket;
    this.readings = s.readings;
    this.finished = null;
    this.prevSnapshot = null;
    this.shownAt = Date.now();
    this.emit();
  }

  private snapshot(): Snapshot {
    return {
      pos: this.pos,
      name: this.name,
      nameColor: this.nameColor,
      birthday: this.birthday,
      sunSign: this.sunSign,
      lifePath: this.lifePath,
      birthCard: this.birthCard,
      ageBracket: this.ageBracket,
      readings: [...this.readings],
    };
  }

  // ─── internals ───────────────────────────────────────

  private advance(): void {
    switch (this.pos.kind) {
      case 'name':
        this.pos = this.facets.length > 0 ? { kind: 'facet', index: 0 } : { kind: 'birthdate' };
        break;
      case 'facet': {
        const next = this.pos.index + 1;
        this.pos = next < this.facets.length ? { kind: 'facet', index: next } : { kind: 'birthdate' };
        break;
      }
      case 'birthdate':
        this.pos = { kind: 'done' };
        this.finished = this.roundUp();
        break;
      case 'done':
        break;
    }
    this.shownAt = Date.now();
  }

  private recordFacet(facet: SurveyFacet, value: string, latency: number, answeredAt: number): void {
    const matched = facet.options.find((o) => o.label === value);
    const channels: Channels = matched
      ? {
          indicators: matched.indicators,
          implications: matched.implications,
          identities: matched.identities,
          hooks: matched.hooks,
          notes: matched.notes,
        }
      : { ...EMPTY_CHANNELS };
    const declined = facet.options.filter((o) => o.label !== value);
    this.readings.push({
      slug: facet.slug,
      facet: facet.facet,
      question: facet.question,
      hidden_target: facet.hidden_target ?? null,
      chosen: value,
      free_text: !matched,
      weight: matched?.weight ?? 0,
      declined: declined.map((o) => o.label),
      channels,
      // Fidelity: every declined option contributes its shadow. Weight sorts, never drops.
      shadows: declined.map((o) => o.shadow),
      answered_at: answeredAt,
      latency_ms: latency,
    });
  }

  private recordBirthdate(iso: string): void {
    const parsed = parseBirthDate(iso);
    if (!parsed) return; // invalid input leaves astro null; survey still completes
    this.birthday = parsed;
    const astro = computeAstroProfile(parsed);
    this.sunSign = astro.sunSign;
    this.lifePath = astro.lifePath;
    this.birthCard = { number: astro.tarotBirthCard.number, name: astro.tarotBirthCard.name };
    this.ageBracket = computeAgeBracket(parsed);
  }

  private roundUp(): RawPortrait {
    const identity: IdentityBlock = {
      name: this.name,
      name_color: this.nameColor,
      birthday: this.birthday,
      sun_sign: this.sunSign,
      life_path: this.lifePath,
      birth_card: this.birthCard,
      age_bracket: this.ageBracket,
      relationship_status:
        this.readings.find((r) => r.slug === 'relationship-status')?.chosen ?? null,
    };
    return {
      identity,
      facets: this.readings,
      amalgam: this.amalgamate(),
      deviations: [],
      collected_at: Date.now(),
    };
  }

  /** Flatten every channel across all facets, ordered by weight (hot first;
   *  ties keep collection order — Array.sort is stable). Nothing is gated or
   *  dropped: low weight just sinks to the bottom. */
  private amalgamate(): Amalgam {
    const sorted = [...this.readings].sort((a, b) => b.weight - a.weight);
    const acc: Amalgam = {
      indicators: [], implications: [], identities: [], hooks: [], notes: [], shadows: [],
    };
    for (const r of sorted) {
      acc.indicators.push(...r.channels.indicators);
      acc.implications.push(...r.channels.implications);
      acc.identities.push(...r.channels.identities);
      acc.hooks.push(...r.channels.hooks);
      acc.notes.push(...r.channels.notes);
      acc.shadows.push(...r.shadows);
    }
    return acc;
  }

  private emit(): void {
    for (const l of this.listeners) {
      try { l(); } catch { /* a listener's crash is its own problem */ }
    }
  }
}

function computeAgeBracket(birthday: { year: number; month: number; day: number }): string {
  const now = new Date();
  const beforeBirthday =
    now.getMonth() + 1 < birthday.month ||
    (now.getMonth() + 1 === birthday.month && now.getDate() < birthday.day);
  const age = now.getFullYear() - birthday.year - (beforeBirthday ? 1 : 0);
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
}
