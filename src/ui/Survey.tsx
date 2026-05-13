import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { MultipleChoice } from './choices/MultipleChoice';
import { Matrix2x2Choice } from './choices/Matrix2x2Choice';
import {
  applyAnswer,
  appendClatNotes,
  clatReact,
  CLAT_HOLD_FOR_FIRST_N_ANSWERS,
  consumeInjected,
  createClaudeClient,
  finalizeSurvey,
  inject,
  markClatSawN,
  mustEnd,
  newDirector,
  nextQuestion,
  popComment,
  pushComment,
  type DirectorState,
  type Survey as SurveyData,
  type SurveyAnswer,
  type SurveyQuestion,
} from '../pipeline';
import { listSessionNames, saveSession, type Session } from '../storage';

type Props = {
  apiKey: string;
  session: Session;
  onComplete: (survey: SurveyData, clatNotes: import('../pipeline').ClatNote[]) => void;
};

const CLAT_POLL_INTERVAL_MS = 1200;

export function Survey({ apiKey, session, onComplete }: Props) {
  const [director, setDirector] = useState<DirectorState>(() => newDirector());
  const [startedAt] = useState(() => Date.now());
  const clientRef = useRef(createClaudeClient(apiKey));

  const [currentQ, setCurrentQ] = useState<SurveyQuestion | null>(() =>
    nextQuestion(newDirector()),
  );

  // The comment shown UNDER the current question (popped off the queue
  // on each advance). null = none.
  const [activeComment, setActiveComment] = useState<string | null>(null);
  // Tracked but no longer surfaced — kept so the polling effect can serialize.
  const clatInFlightRef = useRef(false);

  const [speaking, setSpeaking] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [bMonth, setBMonth] = useState('');
  const [bDay, setBDay] = useState('');

  // Snapshot existing names at mount so re-renders don't re-scan localStorage.
  const [existingNames] = useState<Set<string>>(
    () => new Set(listSessionNames(session.id)),
  );

  function submitName() {
    const v = nameDraft.trim();
    if (!v) return;
    if (existingNames.has(v.toLowerCase())) {
      setNameError('name already used');
      return;
    }
    handleAnswer([v]);
  }

  // Director ref — used by the Clat polling effect to read fresh state.
  const directorRef = useRef(director);
  useEffect(() => { directorRef.current = director; }, [director]);

  function handleAnswer(picked: string[], passed = false) {
    if (!currentQ) return;

    const answeredQ = currentQ;
    const answer: SurveyAnswer = {
      question_id: answeredQ.id,
      picked,
      passed,
    };

    // Apply answer, consume injection slot if this Q was Clat-injected,
    // and pop the next comment from the queue (if any) to display.
    let dirAfter: DirectorState | null = null;
    let poppedComment: string | null = null;

    setDirector((prev) => {
      let next = applyAnswer(prev, answer);
      if (next.injected_queue[0]?.id === answeredQ.id) {
        next = consumeInjected(next);
      }
      // Pop the next comment to display under the upcoming question.
      const pop = popComment(next);
      poppedComment = pop.comment;
      next = pop.state;
      dirAfter = next;
      return next;
    });

    // Synchronously preview the next pick from the post-answer state.
    const dirSnap = dirAfter ?? (() => {
      let n = applyAnswer(director, answer);
      if (n.injected_queue[0]?.id === answeredQ.id) n = consumeInjected(n);
      const pop = popComment(n);
      poppedComment = pop.comment;
      return pop.state;
    })();

    const next = mustEnd(dirSnap) ? null : nextQuestion(dirSnap);
    setCurrentQ(next);
    setActiveComment(poppedComment);
    setNameDraft('');
    setBMonth('');
    setBDay('');
  }

  // Clat polling thread. Serialized (one in flight at a time). Fires only
  // when there are new answers since last fire AND we're past the hold.
  // Idles when there's nothing new — no consistent firing.
  useEffect(() => {
    let cancelled = false;
    let tickTimer = 0;

    async function maybeFire() {
      if (cancelled) return;
      if (clatInFlightRef.current) return;
      const dir = directorRef.current;
      if (dir.answer_log.length <= CLAT_HOLD_FOR_FIRST_N_ANSWERS) return;
      if (dir.answer_log.length <= dir.clat_last_seen_count) return;

      clatInFlightRef.current = true;
      const snapshotN = dir.answer_log.length;

      // Build the "upcoming questions" view for Clat — what she's about
      // to put the subject through (priority lane + likely next pool pick).
      const priority = dir.injected_queue.map((q) => ({
        id: q.id, text: q.text, category: q.category,
      }));
      // Best-effort glimpse at the next pool pick (deterministic preview).
      // We give Clat a sense of what's coming, but the comment is decoupled
      // from where it will land in the queue.
      let nextPool = null;
      const peekFromPool = nextQuestion(dir, () => 0);
      if (peekFromPool && peekFromPool.id !== dir.injected_queue[0]?.id) {
        nextPool = { id: peekFromPool.id, text: peekFromPool.text, category: peekFromPool.category };
      }
      const upcoming = [...priority, ...(nextPool ? [nextPool] : [])];

      try {
        const out = await clatReact(
          clientRef.current,
          dir.pool,
          dir.answer_log,
          upcoming,
          dir.clat_notes,
        );

        if (cancelled) return;

        setDirector((prev) => {
          let n = prev;
          if (out.proposed_question) {
            const q = out.proposed_question;
            const cleaned: SurveyQuestion = {
              ...q,
              axes: q.axes
                ? { x: [q.axes.x[0]!, q.axes.x[1]!], y: [q.axes.y[0]!, q.axes.y[1]!] }
                : undefined,
            };
            n = inject(n, cleaned);
          }
          if (out.comment) {
            n = pushComment(n, out.comment);
          }
          if (out.profile_notes && out.profile_notes.length > 0) {
            n = appendClatNotes(n, out.profile_notes);
          }
          n = markClatSawN(n, snapshotN);
          return n;
        });
      } catch {
        // swallow — clat failures should not block the user
      } finally {
        clatInFlightRef.current = false;
      }
    }

    function tick() {
      void maybeFire();
      if (!cancelled) {
        tickTimer = window.setTimeout(tick, CLAT_POLL_INTERVAL_MS);
      }
    }
    tick();

    return () => {
      cancelled = true;
      if (tickTimer) window.clearTimeout(tickTimer);
    };
  }, []);

  // When currentQ becomes null, we're done. Hand survey + clat_notes off.
  useEffect(() => {
    if (currentQ === null && director.answered_ids.size > 0) {
      onComplete(finalizeSurvey(director, startedAt), director.clat_notes);
    }
  }, [currentQ, director, onComplete, startedAt]);

  // Persist partial survey to the session so resume entries can display the
  // user's name (and any future mid-survey resume can rebuild from this).
  useEffect(() => {
    if (director.answer_log.length === 0) return;
    saveSession({
      ...session,
      survey: { answers: director.answer_log, started_at: startedAt },
    });
  }, [director.answer_log, session, startedAt]);

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
        text={
          activeComment
            ? `${currentQ.text.toLowerCase()}\n        ${activeComment.toLowerCase()}`
            : currentQ.text.toLowerCase()
        }
        onTypingChange={setSpeaking}
      />

      <div className="ui-frame ui-frame--survey">
        <div className="ui-frame__choices">
          {isNameQ && (
            <div className="name-step">
              <form
                className="name-step__form"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitName();
                }}
              >
                <input
                  className={`text-input text-input--ghost ${nameError ? 'text-input--error' : ''}`}
                  value={nameDraft}
                  onChange={(e) => {
                    setNameDraft(e.target.value);
                    // Clear the error the moment they edit — classic field validation behavior.
                    if (nameError) setNameError(null);
                  }}
                  placeholder="your name"
                  autoFocus
                  autoCapitalize="words"
                  autoComplete="given-name"
                  aria-invalid={nameError !== null}
                />
                <button
                  type="submit"
                  className="btn btn--chrome btn--send"
                  disabled={!nameDraft.trim()}
                >
                  enter
                </button>
              </form>
              {nameError && (
                <div className="name-step__error" role="alert">{nameError}</div>
              )}
            </div>
          )}

          {isBirthdayQ && (
            <BirthdayForm
              month={bMonth}
              day={bDay}
              setMonth={setBMonth}
              setDay={setBDay}
              onSubmit={() => {
                const val = bMonth && bDay
                  ? `${bMonth.padStart(2, '0')}-${bDay.padStart(2, '0')}`
                  : '';
                handleAnswer(val ? [val] : [], !val);
              }}
            />
          )}

          {!isNameQ && !isBirthdayQ && currentQ.axes && (
            <Matrix2x2Choice
              key={currentQ.id}
              axes={currentQ.axes}
              options={currentQ.options}
              onPick={(v) => handleAnswer([v])}
            />
          )}
          {!isNameQ && !isBirthdayQ && !currentQ.axes && (
            <MultipleChoice
              key={currentQ.id}
              suggestions={currentQ.options}
              isBinary={currentQ.format === 'binary'}
              onPick={(v) => handleAnswer([v])}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type BirthdayFormProps = {
  month: string;
  day: string;
  setMonth: (v: string) => void;
  setDay: (v: string) => void;
  onSubmit: () => void;
};

function BirthdayForm({ month, day, setMonth, setDay, onSubmit }: BirthdayFormProps) {
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);

  function handleMonthChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/\D/g, '').slice(0, 2);
    setMonth(v);
    if (v.length === 2) dayRef.current?.focus();
  }

  function handleDayChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/\D/g, '').slice(0, 2);
    setDay(v);
  }

  function handleDayKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && day.length <= 1) {
      // If empty, jump back to month immediately; if exactly 1 char, let the
      // delete run, then jump back so the user can keep deleting.
      if (day.length === 0) {
        e.preventDefault();
        monthRef.current?.focus();
      } else {
        // Defer the focus shift until after this keystroke clears the field.
        window.setTimeout(() => monthRef.current?.focus(), 0);
      }
    }
  }

  return (
    <form
      className="birthday-step"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="birthday-row">
        <input
          ref={monthRef}
          className="text-input text-input--ghost text-input--narrow"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={month}
          onChange={handleMonthChange}
          placeholder="MM"
          autoFocus
          aria-label="month"
        />
        <span className="birthday-sep">/</span>
        <input
          ref={dayRef}
          className="text-input text-input--ghost text-input--narrow"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={day}
          onChange={handleDayChange}
          onKeyDown={handleDayKeyDown}
          placeholder="DD"
          aria-label="day"
        />
      </div>
      <button type="submit" className="btn btn--chrome btn--big">
        enter
      </button>
    </form>
  );
}
