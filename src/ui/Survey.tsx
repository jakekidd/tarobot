import { useEffect, useRef, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { MultipleChoice } from './choices/MultipleChoice';
import {
  applyAnswer,
  canEnd,
  clatReact,
  consumeInjected,
  createClaudeClient,
  finalizeSurvey,
  inject,
  mustEnd,
  newDirector,
  nextQuestion,
  type DirectorState,
  type Survey as SurveyData,
  type SurveyAnswer,
  type SurveyQuestion,
} from '../pipeline';

type Props = {
  apiKey: string;
  onComplete: (survey: SurveyData) => void;
  onCancel: () => void;
};

/**
 * The Clat survey. Pure-tap. Director picks questions from the pool;
 * Clat agent fires in parallel on every answer and may inject follow-up
 * Qs (priority-lane → next pick) and a flavor reaction (rendered BELOW
 * the next question as a sub-comment).
 *
 * Atomicity: setDirector uses functional updates so injections landing
 * mid-answer apply correctly. The next-question pick uses the current
 * (already-rendered) director snapshot — late-arriving Clat injections
 * land at the question AFTER next, which is correct.
 */
export function Survey({ apiKey, onComplete, onCancel }: Props) {
  const [director, setDirector] = useState<DirectorState>(() => newDirector());
  const [startedAt] = useState(() => Date.now());
  const clientRef = useRef(createClaudeClient(apiKey));

  // The question currently shown. Picked at handleAnswer time.
  const [currentQ, setCurrentQ] = useState<SurveyQuestion | null>(() =>
    nextQuestion(newDirector()),
  );

  // Clat's flavor reaction to the PREVIOUS answer. Renders below the
  // CURRENT question as an indented sub-comment. Cleared on every advance.
  const [reaction, setReaction] = useState<string | null>(null);
  const [clatThinking, setClatThinking] = useState(false);

  const [speaking, setSpeaking] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [bMonth, setBMonth] = useState('');
  const [bDay, setBDay] = useState('');

  function handleAnswer(picked: string[], passed = false) {
    if (!currentQ) return;

    const answeredQ = currentQ;
    const answer: SurveyAnswer = {
      question_id: answeredQ.id,
      picked,
      passed,
    };

    // Functional update: applies answer + consumes the injection slot
    // (if this Q was Clat-injected). This is race-safe against Clat's
    // own setDirector dispatch happening in parallel.
    let dirAfter: DirectorState | null = null;
    setDirector((prev) => {
      let next = applyAnswer(prev, answer);
      if (next.injected_queue[0]?.id === answeredQ.id) {
        next = consumeInjected(next);
      }
      dirAfter = next;
      return next;
    });

    // Pick next question from the dir state we just computed. If Clat
    // lands a new injection between this dispatch and the next render,
    // it'll show up on the question AFTER this one — acceptable.
    const dirSnap = dirAfter ?? applyAnswer(director, answer);
    const next = mustEnd(dirSnap) ? null : nextQuestion(dirSnap);
    setCurrentQ(next);
    setReaction(null);
    setNameDraft('');
    setBMonth('');
    setBDay('');

    // Fire Clat in parallel. The reaction (if any) is appended BELOW
    // whatever question is on screen when it lands. Injected questions
    // go into the priority lane and apply via functional setDirector.
    setClatThinking(true);
    clatReact(clientRef.current, dirSnap.pool, dirSnap.answer_log, answer, next)
      .then((out) => {
        if (out.flavor_reaction) setReaction(out.flavor_reaction);
        if (out.queued_questions && out.queued_questions.length > 0) {
          const cleaned: SurveyQuestion[] = out.queued_questions.map((q) => ({
            ...q,
            axes: q.axes
              ? {
                  x: [q.axes.x[0]!, q.axes.x[1]!],
                  y: [q.axes.y[0]!, q.axes.y[1]!],
                }
              : undefined,
          }));
          setDirector((prev) => {
            let n = prev;
            for (const q of cleaned) n = inject(n, q);
            return n;
          });
        }
      })
      .catch(() => { /* swallow — clat failures shouldn't block the user */ })
      .finally(() => setClatThinking(false));
  }

  function endNow() {
    setCurrentQ(null);
  }

  // When currentQ becomes null, we're done.
  useEffect(() => {
    if (currentQ === null && director.answered_ids.size > 0) {
      onComplete(finalizeSurvey(director, startedAt));
    }
  }, [currentQ, director, onComplete, startedAt]);

  const total = director.answered_ids.size;
  const showEnd = canEnd(director);

  const isNameQ = currentQ?.id === 'name-input';
  const isBirthdayQ = currentQ?.id === 'birthday';

  if (!currentQ) {
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
        key={currentQ.id}
        text={currentQ.text}
        onTypingChange={setSpeaking}
      />

      {/* Clat's reaction to the PREVIOUS answer, rendered AFTER the
          current question is up. Indented; an empty row above keeps it
          visually separated from the dialogue. */}
      {reaction && (
        <div className="survey__reaction">
          <div className="survey__reaction-spacer" />
          <div className="survey__reaction-text">› {reaction}</div>
        </div>
      )}

      <div className="ui-frame ui-frame--survey">
        <div className="ui-frame__choices">
          {isNameQ && (
            <form
              className="name-step__form"
              onSubmit={(e) => {
                e.preventDefault();
                if (nameDraft.trim()) handleAnswer([nameDraft.trim()]);
              }}
            >
              <input
                className="text-input text-input--ghost"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="your name"
                autoFocus
                autoCapitalize="words"
                autoComplete="given-name"
              />
              <button
                type="submit"
                className="btn btn--chrome btn--send"
                disabled={!nameDraft.trim()}
              >
                enter
              </button>
            </form>
          )}

          {isBirthdayQ && (
            <form
              className="birthday-step"
              onSubmit={(e) => {
                e.preventDefault();
                const val = bMonth && bDay
                  ? `${bMonth.padStart(2, '0')}-${bDay.padStart(2, '0')}`
                  : '';
                handleAnswer(val ? [val] : [], !val);
              }}
            >
              <div className="birthday-row">
                <input
                  className="text-input text-input--ghost text-input--narrow"
                  inputMode="numeric"
                  maxLength={2}
                  value={bMonth}
                  onChange={(e) => setBMonth(e.target.value.replace(/\D/g, ''))}
                  placeholder="MM"
                  autoFocus
                />
                <span>/</span>
                <input
                  className="text-input text-input--ghost text-input--narrow"
                  inputMode="numeric"
                  maxLength={2}
                  value={bDay}
                  onChange={(e) => setBDay(e.target.value.replace(/\D/g, ''))}
                  placeholder="DD"
                />
              </div>
              <button type="submit" className="btn btn--chrome btn--big">
                enter
              </button>
            </form>
          )}

          {!isNameQ && !isBirthdayQ && (
            <MultipleChoice
              suggestions={currentQ.options}
              isBinary={currentQ.format === 'binary'}
              onPick={(v) => handleAnswer([v])}
            />
          )}
          {currentQ.is_dark && !isNameQ && !isBirthdayQ && (
            <button className="btn btn--quiet" onClick={() => handleAnswer([], true)}>
              pass
            </button>
          )}
        </div>

        <div className="ui-frame__meta">
          <span>
            {total} {total === 1 ? 'answer' : 'answers'}
            {clatThinking ? ' · clat is thinking…' : ''}
          </span>
          <div className="ui-frame__meta-actions">
            {showEnd && (
              <button className="btn btn--quiet" onClick={endNow}>
                end survey
              </button>
            )}
            <button className="btn btn--quiet" onClick={onCancel}>quit</button>
          </div>
        </div>
      </div>
    </div>
  );
}
