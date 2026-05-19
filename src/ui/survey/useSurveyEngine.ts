// React hook wrapping the SurveyEngine. Subscribes to engine state changes
// and re-renders the component on each. The engine is created once per
// session (keyed by session_id) and held in a ref so it survives renders.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnthropicAdapter,
  SurveyEngine,
  type EngineState,
  type RenderedQuestion,
} from '../../pipeline/survey';
import { createClaudeClient } from '../../pipeline/claude';
import type { Seer } from '../../pipeline/seer';

import type { SurveyProfile } from '../../pipeline/survey';

type Options = {
  apiKey: string;
  sessionId: string;
  /** Optional pre-loaded data for returning users when constructing
   *  the engine with returning-mode already active. Currently unused —
   *  the modal flow uses engine.confirmReturningPerson() instead. */
  returning?: {
    profileSeed: Partial<SurveyProfile>;
    answeredNodeIds: string[];
    priorIntentions: string[];
    priorSessionSummary?: string;
  };
};

type SurveyHook = {
  state: EngineState;
  currentQuestion: RenderedQuestion | null;
  submitAnswer: (answer: string | string[]) => Promise<void>;
  /** User picked or wrote in their intention. */
  submitIntention: (text: string) => void;
  skipAhead: () => void;
  /** True iff one-level undo is available. Drives chevron visibility. */
  canUndo: boolean;
  /** Restore the engine to its pre-most-recent-pick snapshot. Aborts
   *  any in-flight AI work logically (their results get dropped). */
  undo: () => void;
  /** Pre-built Seer once stage === 'reading_ready'. null until then. */
  seer: Seer | null;
  /** Direct engine handle for actions that don't fit the small wrapper
   *  (e.g. confirmReturningPerson). Stable identity across renders for
   *  this hook instance. */
  engine: SurveyEngine;
};

export function useSurveyEngine(opts: Options): SurveyHook {
  const engine = useMemo(() => {
    const client = createClaudeClient(opts.apiKey);
    const adapter = new AnthropicAdapter(client);
    return new SurveyEngine({
      adapter,
      session_id: opts.sessionId,
      returning: opts.returning
        ? {
            profile_seed: opts.returning.profileSeed,
            answered_node_ids: opts.returning.answeredNodeIds,
            prior_intentions: opts.returning.priorIntentions,
            prior_session_summary: opts.returning.priorSessionSummary,
          }
        : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.apiKey, opts.sessionId]);

  const [state, setState] = useState<EngineState>(() => engine.getState());
  const [seer, setSeer] = useState<Seer | null>(null);

  useEffect(() => {
    const unsub = engine.subscribe((s) => {
      setState(s);
      const sr = engine.getSeer();
      if (sr) setSeer(sr);
    });
    return unsub;
  }, [engine]);

  const submitAnswerRef = useRef(engine.submitAnswer.bind(engine));
  const submitIntentionRef = useRef(engine.submitIntention.bind(engine));
  const skipAheadRef = useRef(engine.skipAhead.bind(engine));
  useEffect(() => {
    submitAnswerRef.current = engine.submitAnswer.bind(engine);
    submitIntentionRef.current = engine.submitIntention.bind(engine);
    skipAheadRef.current = engine.skipAhead.bind(engine);
  }, [engine]);

  const currentQuestion = state.closed ? null : engine.getCurrentQuestion();
  // canUndo is engine-internal (not on EngineState) but it changes
  // exactly when state changes — engine.emit() runs after every
  // mutation that toggles previousState. Read it here, render uses it.
  const canUndo = engine.canUndo();

  return {
    state,
    currentQuestion,
    submitAnswer: (a) => submitAnswerRef.current(a),
    submitIntention: (t) => submitIntentionRef.current(t),
    skipAhead: () => skipAheadRef.current(),
    canUndo,
    undo: () => engine.undo(),
    seer,
    engine,
  };
}
