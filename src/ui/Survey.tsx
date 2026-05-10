import { useEffect, useMemo, useRef, useState } from 'react';
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

export function Survey({ apiKey, onComplete, onCancel }: Props) {
  const [director, setDirector] = useState<DirectorState>(() => newDirector());
  const [startedAt] = useState(() => Date.now());
  const clientRef = useRef(createClaudeClient(apiKey));
  const [currentQ, setCurrentQ] = useState<SurveyQuestion | null>(() =>
    nextQuestion(newDirector()),
  );
  const [reaction, setReaction] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [bMonth, setBMonth] = useState('');
  const [bDay, setBDay] = useState('');

  // Track if Clat is currently running so we can show a subtle indicator.
  const [clatThinking, setClatThinking] = useState(false);

  function handleAnswer(picked: string[], passed = false) {
    if (!currentQ) return;

    const answer: SurveyAnswer = {
      question_id: currentQ.id,
      picked,
      passed,
    };

    // Apply locally first so UI feels instant.
    let nextDirector = applyAnswer(director, answer);

    // If this was the head of the injected queue, drain it.
    if (nextDirector.injected_queue[0]?.id === currentQ.id) {
      nextDirector = consumeInjected(nextDirector);
    }

    setDirector(nextDirector);
    setReaction(null);

    // Pick next question synchronously so user never waits on Clat.
    const next = mustEnd(nextDirector) ? null : nextQuestion(nextDirector);
    setCurrentQ(next);

    // Reset special inputs
    setNameDraft('');
    setBMonth('');
    setBDay('');

    // Fire Clat in parallel — no await
    setClatThinking(true);
    clatReact(clientRef.current, nextDirector.pool, nextDirector.answer_log, answer)
      .then((out) => {
        if (out.flavor_reaction) setReaction(out.flavor_reaction);
        if (out.queued_questions && out.queued_questions.length > 0) {
          let withInjected = nextDirector;
          for (const q of out.queued_questions) {
            // Coerce inbound shape to SurveyQuestion (axes may be tuple-like)
            const cleaned: SurveyQuestion = {
              ...q,
              axes: q.axes
                ? {
                    x: [q.axes.x[0]!, q.axes.x[1]!],
                    y: [q.axes.y[0]!, q.axes.y[1]!],
                  }
                : undefined,
            };
            withInjected = inject(withInjected, cleaned);
          }
          setDirector(withInjected);
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

  // Special-case identity questions that don't fit the multiple-choice mold.
  const isNameQ = currentQ?.id === 'name-input';
  const isBirthdayQ = currentQ?.id === 'birthday';

  const promptText = useMemo(() => {
    if (!currentQ) return '';
    if (reaction) return `${reaction} ${currentQ.text}`;
    return currentQ.text;
  }, [currentQ, reaction]);

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
        text={promptText}
        onTypingChange={setSpeaking}
      />

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
              onPick={(v) => {
                if (v === '__pass__') handleAnswer([], true);
                else handleAnswer([v]);
              }}
            />
          )}
          {currentQ.is_dark && !isNameQ && !isBirthdayQ && (
            <button className="btn btn--quiet" onClick={() => handleAnswer([], true)}>
              pass
            </button>
          )}
        </div>

        <div className="ui-frame__meta">
          <span>{total} {total === 1 ? 'answer' : 'answers'}{clatThinking ? ' · clat is thinking…' : ''}</span>
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
