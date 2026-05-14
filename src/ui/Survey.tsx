// Survey UI — thin shell over the SurveyEngine.
//
// The engine owns all logic (state machine, agent firing, phase progression,
// close criteria). This component just renders the current question, dispatches
// the right input widget for the question's format, and submits the answer
// back to the engine. On close, it waits for the Compiler to produce a brief,
// then hands the brief upstream via onComplete.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { MultipleChoice } from './choices/MultipleChoice';
import { Matrix2x2Choice } from './choices/Matrix2x2Choice';
import { MultiSelectChoice } from './choices/MultiSelectChoice';
import { Spinner } from './Spinner';
import { BirthdayForm } from './survey/BirthdayForm';
import { NameForm } from './survey/NameForm';
import { useSurveyEngine } from './survey/useSurveyEngine';
import { downloadTranscript, persistLog } from './survey/transcript';
import { listSessionNames, saveSession, type Session } from '../storage';
import type { CompilerOutput } from '../pipeline/survey';

// "ready for the cards" button appears after this many answered questions.
// Below this, the user has to keep going (so they don't bail at Q2).
const READY_BUTTON_MIN_TURNS = 6;

type Props = {
  apiKey: string;
  session: Session;
  onComplete: (brief: CompilerOutput) => void;
};

export function Survey({ apiKey, session, onComplete }: Props) {
  const { state, currentQuestion, submitAnswer, skipAhead, compilerOutput } = useSurveyEngine({
    apiKey,
    sessionId: session.id,
  });

  const [speaking, setSpeaking] = useState(false);
  const persistedFor = useRef<string | null>(null);

  // Snapshot existing names once at mount for the duplicate-name guard.
  const existingNames = useMemo(
    () => new Set(listSessionNames(session.id)),
    [session.id],
  );

  // Persist partial state to the session so resume rows can show the name.
  useEffect(() => {
    if (state.profile.name) {
      saveSession({
        ...session,
        survey: {
          answers: state.picks_log.map((p) => ({
            question_id: p.node_id,
            picked: Array.isArray(p.answer) ? p.answer : [p.answer],
            passed: p.answer === 'pass' || (typeof p.answer === 'string' && p.answer === 'pass'),
          })),
          started_at: state.started_at,
        },
      });
    }
  }, [state.profile.name, state.picks_log, state.started_at, session]);

  // When the Compiler finishes, persist the transcript + hand off.
  useEffect(() => {
    if (state.closed && compilerOutput && persistedFor.current !== state.session_id) {
      persistLog(state, compilerOutput);
      persistedFor.current = state.session_id;
      onComplete(compilerOutput);
    }
  }, [state.closed, compilerOutput, onComplete, state]);

  // ─── render branches ──────────────────────────────────

  if (state.closed && !compilerOutput) {
    return (
      <div className="screen screen--survey">
        <Reader />
        <Dialogue
          key="compiling"
          text={'the witch is preparing.'}
          onTypingChange={setSpeaking}
        />
        <Spinner label="preparing" />
        <div className="survey__footer">
          <button
            className="btn btn--quiet"
            onClick={() => downloadTranscript(state, compilerOutput)}
          >
            download transcript
          </button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="screen">
        <div className="screen__lede">…</div>
      </div>
    );
  }

  return (
    <div className="screen screen--survey">
      <Reader isSpeaking={speaking} />

      <Dialogue
        key={currentQuestion.node_id}
        text={
          currentQuestion.preamble
            ? `${currentQuestion.preamble.toLowerCase()}\n${currentQuestion.text.toLowerCase()}`
            : currentQuestion.text.toLowerCase()
        }
        onTypingChange={setSpeaking}
      />

      <div className="ui-frame ui-frame--survey">
        <div className="ui-frame__choices">
          {currentQuestion.format === 'text' && (
            <NameForm
              existingNames={existingNames}
              onSubmit={(name) => void submitAnswer(name)}
            />
          )}

          {currentQuestion.format === 'date' && (
            <BirthdayForm onSubmit={(iso) => void submitAnswer(iso)} />
          )}

          {currentQuestion.format === 'matrix' && currentQuestion.axes && (
            <Matrix2x2Choice
              key={currentQuestion.node_id}
              axes={{ x: currentQuestion.axes[0], y: currentQuestion.axes[1] }}
              options={currentQuestion.options}
              onPick={(v) => void submitAnswer(v)}
            />
          )}

          {currentQuestion.format === 'multi' && (
            <MultiSelectChoice
              key={currentQuestion.node_id}
              options={currentQuestion.options}
              onPick={(values) => void submitAnswer(values)}
            />
          )}

          {(currentQuestion.format === 'choice' || currentQuestion.format === 'binary') && (
            <MultipleChoice
              key={currentQuestion.node_id}
              suggestions={currentQuestion.options}
              isBinary={currentQuestion.format === 'binary'}
              onPick={(v) => void submitAnswer(v)}
            />
          )}
        </div>
      </div>

      {state.picks_log.length >= READY_BUTTON_MIN_TURNS && (
        <div className="survey__footer">
          <button
            className="btn btn--quiet survey__ready"
            onClick={skipAhead}
            title="end the survey and proceed to the reading"
          >
            ready for the cards →
          </button>
        </div>
      )}
    </div>
  );
}
