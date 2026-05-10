import type { ClaudeClient } from '../claude';
import type { EngineState, Profile, Question, Survey } from '../types';
import { cognitionTick } from './cognition';
import { personaSpeak } from './persona';
import {
  appendTranscript,
  bumpTurn,
  dequeueQuestion,
  newEngineState,
  setAnimation,
} from './state';

/**
 * Engine turn lifecycle.
 *
 * Boot:
 *   build initial EngineState from compiler output (Profile + opener queue),
 *   pull the opener Question, render it via persona, append the persona line.
 *
 * Per user pick:
 *   1. append user pick to transcript
 *   2. fire cognition (parallel with #3, conceptually)
 *   3. fire persona to render the response + next question
 *   4. append persona line, set animation, advance turn
 *
 * For MVP this runs sequentially. The cognition + persona calls CAN be
 * parallelized (persona uses pre-cognition state; cognition processes the
 * user pick to update for the *following* turn). Documented but not yet
 * wired; flip later for latency.
 */

export function bootEngine(
  client: ClaudeClient,
  survey: Survey,
  profile: Profile,
  pickedOpener: Question,
): { state: EngineState; firstSpeech: Promise<{ state: EngineState; speech: string }> } {
  // Seed state with the picked opener already in the queue. Alternates
  // are discarded for MVP simplicity (could be re-introduced later as
  // Highlights by the Compiler if useful).
  const initial = newEngineState(survey, profile, [pickedOpener]);

  const firstSpeech = (async () => {
    // Pull the opener into current_question
    const { state: pulled, question } = dequeueQuestion(initial);
    if (!question) throw new Error('engine: opener was empty');

    const persona = await personaSpeak(client, pulled, question, null);
    const withSpeech = appendTranscript(
      pulled,
      'persona',
      persona.speech,
      { question_id: question.id },
    );
    const finalState = setAnimation(withSpeech, persona.animation);

    // Note: client also unused after this, but we still expose state for downstream
    void client;

    return { state: bumpTurn(finalState), speech: persona.speech };
  })();

  return { state: initial, firstSpeech };
}

/**
 * Process a user pick and emit the next persona utterance.
 * Runs cognition (which produces hindsight + profile updates + the next
 * Question) and persona (which renders the response for the picked option
 * AND the next prompt).
 *
 * For MVP, runs cognition first so persona has the freshest brief and
 * the next Question is already enqueued. Flip to parallel later.
 */
export async function userPick(
  client: ClaudeClient,
  state: EngineState,
  pickedIndex: number,
): Promise<EngineState> {
  if (!state.current_question) {
    throw new Error('engine: no current question to answer');
  }

  const pickedOption = state.current_question.options[pickedIndex];
  if (!pickedOption) {
    throw new Error(`engine: invalid pick index ${pickedIndex}`);
  }

  // 1. Append user pick to transcript
  let next = appendTranscript(state, 'user', pickedOption, {
    question_id: state.current_question.id,
    picked_index: pickedIndex,
  });

  const userLineIndex = next.transcript.length - 1;

  // 2. Cognition — process user pick, update profile, generate next Question
  next = await cognitionTick(client, next, userLineIndex);

  // 3. Pull next Question if available
  const { state: pulled, question: nextQ } = dequeueQuestion(next);
  if (!nextQ) {
    // Queue empty (cognition didn't enqueue one). End-of-flow protection.
    return { ...pulled, closed: true };
  }
  next = pulled;

  // 4. Persona — render response to pick + ask next Q
  const persona = await personaSpeak(client, next, nextQ, pickedIndex);

  // 5. Append persona line, set animation, advance turn
  next = appendTranscript(next, 'persona', persona.speech, { question_id: nextQ.id });

  // 6. Cognition tick on the persona's own line (lighter pass — usually adds 1 self-thought)
  const personaLineIndex = next.transcript.length - 1;
  next = await cognitionTick(client, next, personaLineIndex);

  next = setAnimation(next, persona.animation);
  next = bumpTurn(next);

  return next;
}
