import type {
  CastEntry,
  Choice,
  EngineState,
  Highlight,
  Hunch,
  PersonaAnimation,
  Profile,
  Question,
  Speaker,
  Survey,
  Thread,
  TranscriptLine,
} from '../types';

export function newEngineState(
  survey: Survey,
  profile: Profile,
  openerQueue: Question[],
): EngineState {
  return {
    survey,
    profile,
    transcript: [],
    question_queue: openerQueue,
    current_question: null,
    current_animation: 'neutral',
    turn_count: 0,
    closed: false,
  };
}

// ─── Transcript (append-only) ─────────────────────────

export function appendTranscript(
  state: EngineState,
  speaker: Speaker,
  content: string,
  extras: Partial<TranscriptLine> = {},
): EngineState {
  const line: TranscriptLine = {
    turn: state.turn_count,
    speaker,
    content,
    thoughts: [],
    ...extras,
  };
  return { ...state, transcript: [...state.transcript, line] };
}

/** Append hindsight thoughts to a specific transcript line by index. Immutable. */
export function appendHindsight(
  state: EngineState,
  lineIndex: number,
  thoughts: string[],
): EngineState {
  if (lineIndex < 0 || lineIndex >= state.transcript.length) return state;
  const transcript = state.transcript.slice();
  const line = transcript[lineIndex]!;
  transcript[lineIndex] = { ...line, thoughts: [...line.thoughts, ...thoughts] };
  return { ...state, transcript };
}

// ─── Profile delta application ────────────────────────

export type ProfileDeltas = {
  identity_patch?: Partial<Profile['identity']>;
  candidates_replacement?: Choice[];   // full replace
  // CastEntry and Hunch carry state-managed fields (last_referenced_turn,
  // age_turns) that the caller doesn't supply — applyProfileDeltas fills.
  cast_to_add?: Array<Omit<CastEntry, 'last_referenced_turn'>>;
  cast_to_update?: Array<{ role: string; valence?: string; name?: string }>;
  threads_to_add?: Thread[];
  hunches_to_add?: Array<Omit<Hunch, 'age_turns'>>;
  margin_replacement?: string;          // null = unchanged; explicit string = replace
  cognition_log_append?: string;
  ready_to_close?: boolean;
};

export function applyProfileDeltas(profile: Profile, deltas: ProfileDeltas): Profile {
  const next: Profile = { ...profile, version: profile.version + 1 };

  if (deltas.identity_patch) {
    next.identity = { ...profile.identity, ...deltas.identity_patch };
  }
  if (deltas.candidates_replacement) {
    next.candidates = deltas.candidates_replacement;
  }
  if (deltas.cast_to_add && deltas.cast_to_add.length > 0) {
    const fresh: CastEntry[] = deltas.cast_to_add.map((c) => ({
      ...c,
      last_referenced_turn: 0,
    }));
    next.cast = [...profile.cast, ...fresh];
  }
  if (deltas.cast_to_update) {
    next.cast = next.cast.map((c) => {
      const upd = deltas.cast_to_update!.find((u) => u.role === c.role);
      return upd ? { ...c, ...upd } : c;
    });
  }
  if (deltas.threads_to_add && deltas.threads_to_add.length > 0) {
    next.threads = [...profile.threads, ...deltas.threads_to_add];
  }
  if (deltas.hunches_to_add && deltas.hunches_to_add.length > 0) {
    const fresh: Hunch[] = deltas.hunches_to_add.map((h) => ({
      ...h,
      age_turns: 0,
    }));
    next.hunches = [...profile.hunches, ...fresh];
  }
  if (deltas.margin_replacement !== undefined && deltas.margin_replacement !== null) {
    next.margin = deltas.margin_replacement;
  }
  if (deltas.cognition_log_append) {
    next.cognition_log = (profile.cognition_log + '\n' + deltas.cognition_log_append).slice(-2400);
  }
  if (deltas.ready_to_close !== undefined) {
    next.ready_to_close = deltas.ready_to_close;
  }

  // Age all hunches one turn
  next.hunches = next.hunches.map((h) => ({ ...h, age_turns: h.age_turns + 1 }));

  return next;
}

// ─── Highlights (TTL-decayed spotlight) ───────────────

export type HighlightsUpdate = {
  to_add?: Array<Omit<Highlight, 'introduced_turn' | 'ttl'> & { ttl?: number }>;
  to_remove_ids?: string[];
  to_refresh_ids?: string[];   // resets TTL to default
};

export const DEFAULT_HIGHLIGHT_TTL = 5;
export const HIGHLIGHTS_SOFT_CAP = 7;

export function applyHighlightsUpdate(
  highlights: Highlight[],
  update: HighlightsUpdate,
  currentTurn: number,
): Highlight[] {
  let next = highlights.slice();

  // Decrement all TTLs (called on every transcript update)
  next = next.map((h) => ({ ...h, ttl: h.ttl - 1 }));

  // Apply removes
  if (update.to_remove_ids && update.to_remove_ids.length > 0) {
    const removeSet = new Set(update.to_remove_ids);
    next = next.filter((h) => !removeSet.has(h.id));
  }

  // Apply refreshes
  if (update.to_refresh_ids && update.to_refresh_ids.length > 0) {
    const refreshSet = new Set(update.to_refresh_ids);
    next = next.map((h) =>
      refreshSet.has(h.id) ? { ...h, ttl: DEFAULT_HIGHLIGHT_TTL } : h,
    );
  }

  // Drop expired
  next = next.filter((h) => h.ttl > 0);

  // Apply adds (de-dup by id; existing id → refresh)
  if (update.to_add && update.to_add.length > 0) {
    for (const a of update.to_add) {
      const existingIdx = next.findIndex((h) => h.id === a.id);
      const fresh: Highlight = {
        id: a.id,
        topic: a.topic,
        reason: a.reason,
        salience: a.salience ?? 'medium',
        introduced_turn: currentTurn,
        ttl: a.ttl ?? DEFAULT_HIGHLIGHT_TTL,
      };
      if (existingIdx >= 0) next[existingIdx] = fresh;
      else next.push(fresh);
    }
  }

  // Soft cap — drop lowest-salience oldest if over
  if (next.length > HIGHLIGHTS_SOFT_CAP) {
    next.sort((a, b) => {
      const salRank = { high: 3, medium: 2, low: 1 } as const;
      const sa = salRank[a.salience];
      const sb = salRank[b.salience];
      if (sa !== sb) return sb - sa;
      return b.introduced_turn - a.introduced_turn;
    });
    next = next.slice(0, HIGHLIGHTS_SOFT_CAP);
  }

  return next;
}

// ─── Question queue ───────────────────────────────────

export const QUEUE_REFILL_THRESHOLD = 1;
export const QUEUE_MAX_DEPTH = 3;

export function enqueueQuestion(state: EngineState, q: Question): EngineState {
  if (state.question_queue.length >= QUEUE_MAX_DEPTH) return state;
  return { ...state, question_queue: [...state.question_queue, q] };
}

export function dequeueQuestion(state: EngineState): { state: EngineState; question: Question | null } {
  if (state.question_queue.length === 0) {
    return { state, question: null };
  }
  const [head, ...rest] = state.question_queue;
  return {
    state: { ...state, question_queue: rest, current_question: head ?? null },
    question: head ?? null,
  };
}

export function setAnimation(state: EngineState, animation: PersonaAnimation): EngineState {
  return { ...state, current_animation: animation };
}

export function bumpTurn(state: EngineState): EngineState {
  return { ...state, turn_count: state.turn_count + 1 };
}
