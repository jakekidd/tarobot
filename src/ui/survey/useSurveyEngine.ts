// React hook wrapping the SurveyEngine. Subscribes to engine state changes
// and re-renders the component on each. The engine is created once per
// session (keyed by session_id) and held in a ref so it survives renders.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnthropicAdapter,
  SurveyEngine,
  type CompilerOutput,
  type EngineState,
  type RenderedQuestion,
} from '../../pipeline/survey';
import { createClaudeClient } from '../../pipeline/claude';

import type { SurveyProfile } from '../../pipeline/survey';

type Options = {
  apiKey: string;
  sessionId: string;
  /** Optional pre-loaded data for returning users. */
  returning?: {
    profileSeed: Partial<SurveyProfile>;
    priorSessionSummary?: string;
  };
};

type SurveyHook = {
  state: EngineState;
  currentQuestion: RenderedQuestion | null;
  submitAnswer: (answer: string | string[]) => Promise<void>;
  skipAhead: () => void;
  compilerOutput: CompilerOutput | null;
};

export function useSurveyEngine(opts: Options): SurveyHook {
  // Build the engine exactly once per (apiKey, sessionId) pair.
  const engine = useMemo(() => {
    const client = createClaudeClient(opts.apiKey);
    const adapter = new AnthropicAdapter(client);
    return new SurveyEngine({
      adapter,
      session_id: opts.sessionId,
      returning: opts.returning
        ? {
            profile_seed: opts.returning.profileSeed,
            prior_session_summary: opts.returning.priorSessionSummary,
          }
        : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.apiKey, opts.sessionId]);

  const [state, setState] = useState<EngineState>(() => engine.getState());
  const [compilerOutput, setCompilerOutput] = useState<CompilerOutput | null>(null);

  useEffect(() => {
    const unsub = engine.subscribe((s) => {
      setState(s);
      const out = engine.getCompilerOutput();
      if (out) setCompilerOutput(out);
    });
    return unsub;
  }, [engine]);

  const submitAnswerRef = useRef(engine.submitAnswer.bind(engine));
  const skipAheadRef = useRef(engine.skipAhead.bind(engine));
  // Rebind if engine reference changes
  useEffect(() => {
    submitAnswerRef.current = engine.submitAnswer.bind(engine);
    skipAheadRef.current = engine.skipAhead.bind(engine);
  }, [engine]);

  const currentQuestion = state.closed ? null : engine.getCurrentQuestion();

  return {
    state,
    currentQuestion,
    submitAnswer: (a) => submitAnswerRef.current(a),
    skipAhead: () => skipAheadRef.current(),
    compilerOutput,
  };
}

