// Survey engine. Plain TS class — no React, no DOM, no model SDK. Owns
// EngineState; everything else (UI, tests, scripts) reads state and submits
// answers. Agents fire through an LLMAdapter handed in at construction.
//
// Concurrency model: every non-opener pick fires Observer + Investigator in
// parallel. submitAnswer awaits the Investigator (we need the next question
// rendered) but Observer's promise resolves in the background and updates
// state when it does. State updates are immutable; subscribers re-read on
// each change via the subscribe() callback.

import type { LLMAdapter } from './adapter';
import { runObserver } from './agents/observer';
import { runInvestigator } from './agents/investigator';
import { runCompiler } from './agents/compiler';
import { computeAstroProfile, parseBirthDate } from '../astrology';
import {
  commentForAnswer,
  getNode,
  getOpeners,
  getRoots,
  relevantInterp,
  renderQuestion,
  resolveNextNode,
  TREE,
} from './tree';
import { derivePhase } from './phase';
import type {
  CastMember,
  CloseReason,
  CompilerOutput,
  EngineListener,
  EngineState,
  Hypothesis,
  InvestigatorAvailableNode,
  Note,
  PickEvent,
  QueueItem,
  RenderedQuestion,
  SurveyProfile,
  TimingEvent,
} from './types';

export type EngineOpts = {
  adapter: LLMAdapter;
  session_id?: string;
  returning?: {
    profile_seed: Partial<SurveyProfile>;
    prior_session_summary?: string;
  };
};

const OPENER_FREE_AGENTS = new Set<string>(['name', 'birthday']);  // no agents fire after these
const OPENER_NODE_IDS = new Set<string>(getOpeners());

export class SurveyEngine {
  private state: EngineState;
  private opts: EngineOpts;
  private listeners = new Set<EngineListener>();
  private currentRenderedAt = 0;
  private compilerOutput: CompilerOutput | null = null;
  private compilerPromise: Promise<CompilerOutput> | null = null;
  private pendingObserverPromise: Promise<void> | null = null;

  constructor(opts: EngineOpts) {
    this.opts = opts;
    this.state = this.initState(opts);
  }

  // ─── public API ──────────────────────────────────────

  getState(): EngineState {
    return this.state;
  }

  getCurrentQuestion(): RenderedQuestion | null {
    if (this.state.closed) return null;
    const head = this.state.queue[0];
    if (!head) return null;
    this.currentRenderedAt = Date.now();
    return renderQuestion(head.node_id, this.state.profile, head.preamble);
  }

  async submitAnswer(answer: string | string[]): Promise<void> {
    if (this.state.closed) return;
    const head = this.state.queue[0];
    if (!head) return;
    const node = getNode(head.node_id);
    if (!node) return;

    const renderedAt = this.currentRenderedAt || Date.now();
    const answeredAt = Date.now();
    const latencyMs = answeredAt - renderedAt;

    // 1. Record pick
    const renderedNow = renderQuestion(head.node_id, this.state.profile);
    const pick: PickEvent = {
      node_id: head.node_id,
      question_text: renderedNow.text,
      answer,
      answered_at: answeredAt,
      prompted_by: head.prompted_by,
    };
    const timing: TimingEvent = {
      node_id: head.node_id,
      rendered_at: renderedAt,
      answered_at: answeredAt,
      latency_ms: latencyMs,
      revisions: 0,
    };

    // Defensive: a node should never be picked twice. If we somehow got
    // here with an already-asked node, log loudly and skip the second
    // recording (better than corrupting the picks_log).
    if (this.state.asked_node_ids.includes(head.node_id)) {
      console.warn(
        `[survey] node '${head.node_id}' was already asked. dropping duplicate. queue: ${this.state.queue.map((q) => q.node_id).join(',')}`,
      );
      this.setState({ queue: this.state.queue.slice(1) });
      this.emit();
      return;
    }

    this.setState({
      picks_log: [...this.state.picks_log, pick],
      timing_log: [...this.state.timing_log, timing],
      asked_node_ids: [...this.state.asked_node_ids, head.node_id],
      queue: this.state.queue.slice(1),
    });

    // 2. Populate profile if this was an opener
    this.applyOpenerDataIfRelevant(head.node_id, answer);

    // 3. Advance phase from turn count (no longer heat-driven).
    this.setState({
      phase: derivePhase(this.state.phase, this.state.picks_log.length, false),
    });

    // 4. For openers `name` and `birthday`, no agents fire. Just enqueue next.
    if (OPENER_FREE_AGENTS.has(head.node_id)) {
      this.enqueueTreeNext(head.node_id, answer, /* preamble */ null);
      this.emit();
      return;
    }

    // 5. Determine the next question.
    //    If the tree dictates a next (via answer-override or node.next), use it
    //    + the inline answer-comment as preamble. Otherwise fire the
    //    Investigator to pick a new root + preamble.
    const inlineComment = typeof answer === 'string'
      ? commentForAnswer(node, answer)
      : null;
    const treeNext = resolveNextNode(node, answer);

    if (treeNext && !this.state.asked_node_ids.includes(treeNext)) {
      this.enqueueDirect(treeNext, /* prompted_by */ null, inlineComment);
    } else {
      // Investigator is the user-blocking path — flip the dizzy/thinking flag
      // so the UI can show a loading state while we wait.
      this.setState({ thinking: true });
      this.emit();
      try {
        await this.fireInvestigator(inlineComment);
      } finally {
        this.setState({ thinking: false });
      }
    }

    // 6. Fire Observer async — updates state when it resolves; doesn't block.
    this.pendingObserverPromise = this.fireObserver(pick).then(() => {
      this.pendingObserverPromise = null;
    });

    this.emit();
  }

  skipAhead(): void {
    void this.finalize('user_exit');
  }

  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Returns the Compiler's brief, populated after close. null until then. */
  getCompilerOutput(): CompilerOutput | null {
    return this.compilerOutput;
  }

  /** Awaitable handle for the Compiler. Null until close fires. */
  getCompilerPromise(): Promise<CompilerOutput> | null {
    return this.compilerPromise;
  }

  /** Await any in-flight Observer call. Useful for tests that need a quiet state. */
  async waitForObserver(): Promise<void> {
    if (this.pendingObserverPromise) await this.pendingObserverPromise;
  }

  // ─── state mutation ──────────────────────────────────

  private setState(partial: Partial<EngineState>): void {
    this.state = { ...this.state, ...partial };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // listener crash is its problem, not ours
      }
    }
  }

  // ─── init ────────────────────────────────────────────

  private initState(opts: EngineOpts): EngineState {
    const startProfile: SurveyProfile = {
      name: '',
      birthday: null,
      sun_sign: null,
      life_path: null,
      birth_card: null,
      age_bracket: null,
      birth_time_bracket: null,
      has_question_mode: null,
      sections: {
        identity: [], state: [], relational: [],
        self_model: [], decision_context: [], patterns: [],
      },
      cast: [],
      contradictions: [],
      hooks: [],
      recommended_posture: null,
      ...(opts.returning?.profile_seed ?? {}),
    };
    const isReturning = !!opts.returning;

    // Initial queue: ONLY the first unsatisfied opener. Each opener's `next`
    // field enqueues the following one, so listing them all up front would
    // duplicate (every opener would be queued twice — once at init, once
    // by the previous opener's tree-next).
    const firstUnsatisfied = getOpeners().find(
      (id) => !this.isOpenerSatisfiedFor(id, startProfile),
    );
    const openerQueue: QueueItem[] = firstUnsatisfied
      ? [{ node_id: firstUnsatisfied, prompted_by: null, priority: 'high' }]
      : [];

    return {
      session_id: opts.session_id ?? generateSessionId(),
      started_at: Date.now(),
      tree_version: TREE.v,
      profile: startProfile,
      is_returning_user: isReturning,
      prior_session_summary: opts.returning?.prior_session_summary,
      choice_draft: null,
      hypotheses: [],
      queue: openerQueue,
      picks_log: [],
      timing_log: [],
      asked_node_ids: [],
      active_threads: [],
      heat: 0,             // unused now — kept for telemetry only
      heat_history: [],    // unused
      phase: 'A',
      closed: false,
      thinking: false,
    };
  }

  private isOpenerSatisfiedFor(node_id: string, profile: SurveyProfile): boolean {
    switch (node_id) {
      case 'name':         return profile.name.trim().length > 0;
      case 'birthday':     return profile.birthday !== null;
      case 'birth_time':   return profile.birth_time_bracket !== null;
      case 'has_question': return profile.has_question_mode !== null;
      default:             return false;
    }
  }

  private applyOpenerDataIfRelevant(node_id: string, answer: string | string[]): void {
    const ans = typeof answer === 'string' ? answer : answer[0];
    if (!ans) return;

    if (node_id === 'name') {
      this.setState({ profile: { ...this.state.profile, name: ans.trim() } });
      return;
    }
    if (node_id === 'birthday') {
      const parsed = parseBirthDate(ans);
      if (!parsed) return;
      const astro = computeAstroProfile(parsed);
      this.setState({
        profile: {
          ...this.state.profile,
          birthday: parsed,
          sun_sign: astro.sunSign,
          life_path: astro.lifePath,
          birth_card: { number: astro.tarotBirthCard.number, name: astro.tarotBirthCard.name },
          age_bracket: computeAgeBracket(parsed),
        },
      });
      return;
    }
    if (node_id === 'birth_time') {
      this.setState({ profile: { ...this.state.profile, birth_time_bracket: mapBirthTime(ans) } });
      return;
    }
    if (node_id === 'has_question') {
      this.setState({ profile: { ...this.state.profile, has_question_mode: mapHasQuestion(ans) } });
      return;
    }
  }

  private enqueueDirect(node_id: string, promptedBy: string | null, preamble: string | null): void {
    // Defensive dedupe — never enqueue a node that's already in the queue or
    // already been asked. The engine's pick advance + tree.next chain + the
    // Investigator output are three independent sources; this one check stops
    // double-queueing from any of them.
    if (this.state.asked_node_ids.includes(node_id)) return;
    if (this.state.queue.some((q) => q.node_id === node_id)) return;
    this.setState({
      queue: [
        ...this.state.queue,
        {
          node_id,
          prompted_by: promptedBy,
          priority: 'normal',
          preamble: preamble ?? undefined,
        },
      ],
    });
  }

  private enqueueTreeNext(prevNodeId: string, answer: string | string[], preamble: string | null): void {
    const node = getNode(prevNodeId);
    if (!node) return;
    const next = resolveNextNode(node, answer);
    if (!next || this.state.asked_node_ids.includes(next)) return;
    this.enqueueDirect(next, null, preamble);
  }

  // ─── agent firing ────────────────────────────────────

  private buildAvailableNodes(): InvestigatorAvailableNode[] {
    return getRoots()
      .filter((id) => !this.state.asked_node_ids.includes(id))
      .filter((id) => !OPENER_NODE_IDS.has(id))
      .map((id) => {
        const n = getNode(id)!;
        return {
          id,
          text: n.q,
          format: n.f,
          is_dark: n.is_dark === true,
        };
      });
  }

  private async fireInvestigator(inlineComment: string | null): Promise<void> {
    const available = this.buildAvailableNodes();
    if (available.length === 0) {
      // No more roots — the dialogue tree is exhausted. Close cleanly.
      await this.finalize('queue_exhausted');
      return;
    }

    let chosenId: string | null = null;
    let preamble = '';

    try {
      const out = await runInvestigator(this.opts.adapter, {
        state: this.state,
        available_nodes: available,
      });
      const candidate = out.next_question.node_id;
      const isAvailable = available.some((n) => n.id === candidate);
      const notAsked = !this.state.asked_node_ids.includes(candidate);
      if ((isAvailable || candidate === 'GENERATED') && notAsked) {
        chosenId = candidate === 'GENERATED' ? available[0]!.id : candidate;  // generated-question handling is a v2 feature
        preamble = out.preamble;
      }
    } catch {
      // fall through to deterministic fallback
    }

    if (!chosenId) {
      chosenId = available[0]!.id;
      preamble = '';
    }

    // Phase A/E never get preambles
    if (this.state.phase === 'A' || this.state.phase === 'E') preamble = '';

    // Combine inline answer-comment + Investigator preamble. Inline first.
    const combined = [inlineComment, preamble].filter((s): s is string => Boolean(s && s.trim())).join(' ');

    this.enqueueDirect(chosenId, null, combined.length > 0 ? combined : null);
  }

  private async fireObserver(pick: PickEvent): Promise<void> {
    try {
      const interp = relevantInterp(pick.node_id, pick.answer);
      const out = await runObserver(this.opts.adapter, {
        state: this.state,
        latest_pick: pick,
        relevant_interp: interp,
      });

      const now = Date.now();
      const newNotes: Note[] = out.notes_to_append.map((n) => ({
        ...n,
        created_at: now,
      }));

      const sections = { ...this.state.profile.sections };
      for (const note of newNotes) {
        const section = routeNoteToSection(note);
        sections[section] = [...sections[section], note];
      }

      // Thread updates
      const threadMap = new Map(this.state.active_threads.map((t) => [t.thread_id, t]));
      for (const upd of out.thread_status_updates) {
        const t = threadMap.get(upd.thread_id);
        if (t) threadMap.set(upd.thread_id, { ...t, status: upd.status });
      }

      this.setState({
        profile: {
          ...this.state.profile,
          sections,
          cast: mergeCast(this.state.profile.cast, out.cast_updates),
          contradictions: [...this.state.profile.contradictions, ...out.contradictions_found],
          hooks: [...this.state.profile.hooks, ...out.hooks_found],
          recommended_posture:
            out.recommended_posture_update ?? this.state.profile.recommended_posture,
        },
        choice_draft: out.choice_update ?? this.state.choice_draft,
        hypotheses: mergeHypotheses(this.state.hypotheses, out.hypotheses_updates),
        active_threads: Array.from(threadMap.values()),
      });

      this.emit();
      // No auto-close check — survey runs until user_exit or queue_exhausted.
    } catch {
      // Observer failure is non-fatal; engine continues with its current state.
    }
  }

  // ─── close ────────────────────────────────────────────

  private async finalize(reason: CloseReason): Promise<void> {
    if (this.state.closed) return;
    this.setState({
      closed: true,
      close_reason: reason,
      phase: 'E',
      queue: [],
      thinking: true,    // Compiler is about to run — keep dizzy state on
    });
    this.emit();

    if (!this.compilerPromise) {
      this.compilerPromise = runCompiler(this.opts.adapter, { state: this.state })
        .then((out) => {
          this.compilerOutput = out;
          this.setState({ thinking: false });
          this.emit();
          return out;
        })
        .catch((err) => {
          this.setState({ thinking: false });
          this.emit();
          throw err;
        });
    }
  }
}

// ─── helpers (module-local) ─────────────────────────────

function generateSessionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

function mapBirthTime(ans: string): 'morning' | 'afternoon_evening' | 'overnight' | 'unknown' {
  if (ans.includes('morning')) return 'morning';
  if (ans.includes('afternoon')) return 'afternoon_evening';
  if (ans.includes('overnight')) return 'overnight';
  return 'unknown';
}

function mapHasQuestion(ans: string): 'specific' | 'general' | 'not_really' | 'not_sure' {
  if (ans.includes('specific')) return 'specific';
  if (ans.includes('general'))  return 'general';
  if (ans.includes('not really')) return 'not_really';
  return 'not_sure';
}

function routeNoteToSection(note: Note): keyof SurveyProfile['sections'] {
  // Keyword heuristic. Iterate via bot harness once we have real Observer output.
  const t = note.text.toLowerCase();
  if (note.category === 'gossip_flag') return 'relational';
  if (note.category === 'confirmed_thread') return 'patterns';
  if (/\b(work|career|job|occupation)\b/.test(t)) return 'state';
  if (/\b(partner|friend|family|mom|dad|relationship)\b/.test(t)) return 'relational';
  if (/\b(self|identity|version|who am)\b/.test(t)) return 'self_model';
  if (/\b(choice|decision|fork|avoid|stuck)\b/.test(t)) return 'decision_context';
  if (/\b(pattern|always|never|tend|habit)\b/.test(t)) return 'patterns';
  return 'state';
}

function mergeCast(existing: CastMember[], updates: CastMember[]): CastMember[] {
  const byLabel = new Map(existing.map((c) => [c.label, c]));
  for (const u of updates) byLabel.set(u.label, u);
  return Array.from(byLabel.values());
}

function mergeHypotheses(existing: Hypothesis[], updates: Hypothesis[]): Hypothesis[] {
  const byId = new Map(existing.map((h) => [h.id, h]));
  for (const u of updates) byId.set(u.id, u);
  return Array.from(byId.values());
}
