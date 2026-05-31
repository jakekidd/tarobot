// Bench's own minimal hook over SurveyEngine.
//
// Distinct from src/ui/survey/useSurveyEngine.ts on purpose. The main-
// app hook carries persistence side-effects (the Person record save
// threshold), modal callbacks, and other shaping appropriate to the
// production reading experience. Bench wants the engine plain — no
// persistence wiring, no modals, no farewell substate. Just construct,
// subscribe, expose. Lets the dev side iterate on engine internals
// without worrying about production storage drift.

import { useEffect, useMemo, useState } from 'react';
import {
  AnthropicAdapter,
  SurveyEngine,
  type EngineState,
  type RenderedQuestion,
} from '../pipeline/survey';
import { createClaudeClient } from '../pipeline/claude';
import type { Seer } from '../pipeline/seer';

type Opts = {
  apiKey: string;
  /** Bumps to force engine reconstruction on "start fresh". */
  resetKey: number;
};

type BenchHook = {
  engine: SurveyEngine;
  state: EngineState;
  currentQuestion: RenderedQuestion | null;
  submitAnswer: (answer: string | string[]) => Promise<void>;
  submitIntention: (text: string) => void;
  canUndo: boolean;
  undo: () => void;
  seer: Seer | null;
};

export function useEngine({ apiKey, resetKey }: Opts): BenchHook {
  const engine = useMemo(() => {
    const adapter = new AnthropicAdapter(createClaudeClient(apiKey));
    return new SurveyEngine({ adapter });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, resetKey]);

  // Subscribe to engine state changes; the engine emits its full state
  // on every mutation, so we just mirror it into React state. The
  // initial value is what the engine reports at construction; subscribe
  // returns an unsubscribe for cleanup. The subscriber itself is the
  // sole driver of updates — no setState during effect body.
  const [state, setState] = useState<EngineState>(() => engine.getState());
  const [seer, setSeer] = useState<Seer | null>(() => engine.getSeer());

  useEffect(() => {
    return engine.subscribe((s) => {
      setState(s);
      setSeer((prev) => {
        const cur = engine.getSeer();
        return prev === cur ? prev : cur;
      });
    });
  }, [engine]);

  // currentQuestion derives from state — recompute on state changes.
  const currentQuestion = useMemo<RenderedQuestion | null>(() => {
    void state;
    return engine.getCurrentQuestion();
  }, [engine, state]);

  return {
    engine,
    state,
    currentQuestion,
    submitAnswer: (a) => engine.submitAnswer(a),
    submitIntention: (t) => engine.submitIntention(t),
    canUndo: engine.canUndo(),
    undo: () => engine.undo(),
    seer,
  };
}
