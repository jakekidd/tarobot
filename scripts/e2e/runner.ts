// Runner — drives the SurveyEngine against the bot, streams events to the
// logger, finalizes, writes the run log.

import {
  AnthropicAdapter,
  SurveyEngine,
  type CompilerOutput,
  type EngineState,
} from '../../src/pipeline/survey';
import type { ClaudeClient } from '../../src/pipeline/claude';
import type { Archetype } from './archetype';
import { pickAnswer, type TranscriptEntry } from './bot';
import type { RunLogger } from './log';

export type RunResult = {
  final_state: EngineState;
  brief: CompilerOutput | null;
  transcript: TranscriptEntry[];
};

export async function runSurvey(
  client: ClaudeClient,
  archetype: Archetype,
  logger: RunLogger,
): Promise<RunResult> {
  const adapter = new AnthropicAdapter(client);
  const engine = new SurveyEngine({ adapter });

  const transcript: TranscriptEntry[] = [];
  let lastPhase = engine.getState().phase;
  let qIdx = 0;
  let lastObservedNotesCount = 0;

  logger.phaseHeader(lastPhase, engine.getState().heat);

  // Loop until the engine closes.
  while (!engine.getState().closed) {
    const question = engine.getCurrentQuestion();
    if (!question) {
      // No question available — wait briefly for any in-flight Observer to land
      // (rare). If still nothing, break.
      await engine.waitForObserver();
      if (!engine.getCurrentQuestion()) break;
      continue;
    }

    qIdx++;
    logger.question(qIdx, question.text, question.options, question.preamble);

    // Bot picks an answer.
    let pick;
    try {
      pick = await pickAnswer(client, archetype, transcript, question);
    } catch (err) {
      logger.error('bot.pickAnswer', err);
      // Fallback: pick the first option deterministically
      pick = {
        chosen: question.format === 'multi' ? [question.options[0]!] : question.options[0]!,
        latency_ms: 1500,
      };
    }

    const latency = pick.latency_ms ?? 1500;
    logger.answer(pick.chosen, latency);
    transcript.push({ q: question.text, a: pick.chosen });

    // Submit to engine. Wait for Investigator to complete the next-question pick.
    await engine.submitAnswer(pick.chosen);

    // Phase transition log
    const nowPhase = engine.getState().phase;
    if (nowPhase !== lastPhase) {
      lastPhase = nowPhase;
      logger.phaseHeader(lastPhase, engine.getState().heat);
    }

    // Observer status — wait for its async resolution then snapshot
    await engine.waitForObserver();
    const state = engine.getState();
    const noteCount = countNotes(state);
    if (noteCount !== lastObservedNotesCount) {
      lastObservedNotesCount = noteCount;
      logger.observerUpdate(
        noteCount,
        state.choice_draft?.confidence ?? null,
        state.heat,
      );
    }

    if (state.closed) break;
  }

  const final_state = engine.getState();
  logger.close(final_state.close_reason ?? 'unknown');

  // Wait for the Compiler to finish
  const briefPromise = engine.getCompilerPromise();
  let brief: CompilerOutput | null = null;
  if (briefPromise) {
    try {
      brief = await briefPromise;
      logger.compilerSection('PROSE BRIEF', brief.prose_brief);
    } catch (err) {
      logger.error('compiler', err);
    }
  }

  return { final_state, brief, transcript };
}

function countNotes(state: EngineState): number {
  const s = state.profile.sections;
  return s.identity.length + s.state.length + s.relational.length
    + s.self_model.length + s.decision_context.length + s.patterns.length;
}
