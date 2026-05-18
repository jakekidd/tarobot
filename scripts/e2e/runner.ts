// Runner — drives the SurveyEngine against the bot, streams events to the
// logger, finalizes, writes the run log.

import {
  AnthropicAdapter,
  SurveyEngine,
  type EngineState,
} from '../../src/pipeline/survey';
import type { ClaudeClient } from '../../src/pipeline/claude';
import type { Archetype } from './archetype';
import { pickAnswer, type TranscriptEntry } from './bot';
import type { RunLogger } from './log';
import { recordTokens } from './tokens';

export type RunResult = {
  final_state: EngineState;
  brief: null;     // legacy slot — Seer owns the prose now
  transcript: TranscriptEntry[];
};

export type RunOptions = {
  maxQuestions?: number;  // artificial cap; engine no longer auto-closes by count
};

export async function runSurvey(
  client: ClaudeClient,
  archetype: Archetype,
  logger: RunLogger,
  options: RunOptions = {},
): Promise<RunResult> {
  const maxQuestions = options.maxQuestions ?? 15;
  const adapter = new AnthropicAdapter(client, recordTokens);
  const engine = new SurveyEngine({ adapter });

  const transcript: TranscriptEntry[] = [];
  let lastPhase = engine.getState().phase;
  let qIdx = 0;
  let lastObservedNotesCount = 0;

  logger.phaseHeader(lastPhase, engine.getState().heat);

  // Loop until the engine closes OR we hit the artificial cap.
  while (!engine.getState().closed) {
    if (qIdx >= maxQuestions) {
      // Artificial cutoff — close cleanly via skipAhead.
      engine.skipAhead();
      break;
    }
    const question = engine.getCurrentQuestion();
    if (!question) {
      // No question available — wait briefly for any in-flight Observer to land
      // (rare). If still nothing, break.
      await engine.waitForQuiescence();
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
        chosen: question.options[0]!,
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

    // Pipeline status — wait for the full Observer→Detective→Interrogator chain.
    await engine.waitForQuiescence();
    const state = engine.getState();
    const noteCount = countNotes(state);
    if (noteCount !== lastObservedNotesCount) {
      lastObservedNotesCount = noteCount;
      logger.observerUpdate(
        noteCount,
        state.investigation.choice_draft?.confidence ?? null,
        state.heat,
      );
    }

    if (state.closed) break;
  }

  const final_state = engine.getState();
  logger.close(final_state.close_reason ?? 'unknown');

  // Wait for the Seer's intro to land. Replaces the old Compiler wait
  // step. We don't have a "brief" anymore — the prose lives inside Seer.
  const seer = engine.getSeer();
  if (seer) {
    try {
      await seer.ready;
      logger.compilerSection('SEER INTRO', seer.getState().intro?.text ?? '(no intro)');
    } catch (err) {
      logger.error('seer.intro', err);
    }
  }

  return { final_state, brief: null, transcript };
}

function countNotes(state: EngineState): number {
  const s = state.profile.sections;
  return s.identity.length + s.state.length + s.relational.length
    + s.self_model.length + s.decision_context.length + s.patterns.length;
}
