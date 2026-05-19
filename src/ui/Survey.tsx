// Survey UI — thin shell over the SurveyEngine.
//
// The engine owns all logic (state machine, agent firing, phase progression,
// close criteria). This component handles:
//   - rendering the current question + dispatching the right input widget
//   - the returning-user modal (after Q1 name submit)
//   - persistence: createPerson / updatePerson / appendVisitToPerson at
//     the right lifecycle moments, plus active-session save threshold
//   - handoff: on survey close, give the ready Seer to App
//
// The save-threshold rule: nothing is persisted to localStorage until the
// user has answered all 3 openers (name, birthday, has_question). Before
// that, a half-bailed session leaves no litter.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { MultipleChoice } from './choices/MultipleChoice';
import { Matrix2x2Choice } from './choices/Matrix2x2Choice';
import { Spinner } from './Spinner';
import { BirthdayForm } from './survey/BirthdayForm';
import { NameForm } from './survey/NameForm';
import { IntentForm } from './survey/IntentForm';
import { RelationshipStatusForm } from './survey/RelationshipStatusForm';
import { GagQuestion } from './survey/GagQuestion';
import { IntentConfirm } from './survey/IntentConfirm';
import { RelationshipPickForm } from './survey/RelationshipPickForm';
import { useSurveyEngine } from './survey/useSurveyEngine';
import { ReturningUserModal } from './survey/ReturningUserModal';
import { downloadTranscript, persistLog } from './survey/transcript';
import { setDizzy } from './scene/dizzyStore';
import {
  appendVisitToPerson,
  clearActiveSession,
  createPersonFromVisit,
  deletePerson,
  listKnownNames,
  saveActiveSession,
  savePerson,
  getPerson,
  type Session,
  type VisitRecord,
} from '../storage';
import { findPeopleMatchingName, pickReturnLine, type ReturningMatch } from '../pipeline/survey';
import type { Seer } from '../pipeline/seer';
import type { SurveyProfile } from '../pipeline/survey';
import { publishDebug, clearDebug } from '../debug/debugBus';
import { ChatInput } from './ChatInput';

const READY_BUTTON_MIN_TURNS = 6;

type Props = {
  apiKey: string;
  session: Session;
  /** Survey hands off a ready Seer (intro pre-built) instead of a brief. */
  onComplete: (seer: Seer) => void;
};

export function Survey({ apiKey, session, onComplete }: Props) {
  const { state, currentQuestion, submitAnswer, submitIntention, skipAhead, seer, engine } = useSurveyEngine({
    apiKey,
    sessionId: session.id,
  });

  const [speaking, setSpeaking] = useState(false);
  const persistedFor = useRef<string | null>(null);

  // Snapshot existing known names for the soft "this name exists" hint
  // on the NameForm. Live name-match (which fires the modal) happens on
  // submit, separately.
  const existingNames = useMemo<Set<string>>(
    () => new Set(listKnownNames()),
    [],
  );

  // ─── returning-user modal state ───────────────────────
  // null: no modal needed. [...]: matches found, modal blocks until
  // user picks RESUME or START FRESH.
  const [pendingMatches, setPendingMatches] = useState<ReturningMatch[] | null>(null);

  // Wraps submitAnswer for the name question. Check matches FIRST
  // (synchronous localStorage read) so the modal opens before submit
  // returns — no flash of Q2 between the engine processing the name
  // and the modal painting over it.
  async function handleNameSubmit(name: string) {
    const cleaned = name.trim();
    if (cleaned) {
      const matches = findPeopleMatchingName(cleaned);
      if (matches.length > 0) setPendingMatches(matches);
    }
    await submitAnswer(name);
  }

  // ─── returning-user line (mascot) ─────────────────────
  // Set when user picks RESUME on the modal. Rendered in the dialogue
  // slot for one tick, then cleared so the next question's preamble
  // takes over.
  const [returnLine, setReturnLine] = useState<string | null>(null);

  // ─── relationship_pick: "i'm sensing..." mascot line ───
  // Set by RelationshipPickForm via callback while the user is typing
  // a name. While non-null, the dialogue box replaces the original
  // question with the sensing line (voiced by the mascot, instant,
  // colored to the name's accent).
  const [sensing, setSensing] = useState<{ name: string; color: string } | null>(null);

  function handleResume(match: ReturningMatch) {
    engine.confirmReturningPerson(match);
    personIdRef.current = match.person_id;
    setPersonIdState(match.person_id);
    setReturnLine(pickReturnLine(state.profile.name));
    setPendingMatches(null);
  }

  function handleStartFresh() {
    // Single-match case: user clicked OVERWRITE — delete the matched
    // Person. Multi-match (NONE OF THESE): user is claiming to be a
    // new visitor under a shared first name, so leave every matched
    // Person untouched. Different verbs, different semantics.
    if (pendingMatches && pendingMatches.length === 1) {
      deletePerson(pendingMatches[0]!.person_id);
    }
    engine.confirmStartFresh();
    setPendingMatches(null);
  }

  // ─── save-threshold persistence ───────────────────────
  // Tracked Person id for THIS visit. null until either:
  //   - RESUME modal confirms (set in handleResume), or
  //   - save threshold creates a fresh Person (set in the effect below).
  // Engine doesn't know or care about person_id — Survey owns it.
  const personIdRef = useRef<string | null>(null);
  const [personIdState, setPersonIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!allOpenersAnswered(state.profile, state.asked_node_ids)) return;
    const profileSnapshot = cloneProfile(state.profile);
    const answeredFromSession = state.picks_log.map((p) => p.node_id);

    if (personIdRef.current === null) {
      // Crossing the threshold for the first time as a NEW user. Create
      // a Person shell now so the resume list shows them.
      const visit: VisitRecord = {
        visit_id: state.session_id,
        started_at: state.started_at,
        answered_node_ids: answeredFromSession,
      };
      const p = createPersonFromVisit({ profile: profileSnapshot, visit });
      personIdRef.current = p.id;
      setPersonIdState(p.id);
    } else {
      // Update the existing Person's profile + answered union as the
      // visit progresses. We do NOT push a new visit record here — only
      // at survey close.
      const existing = getPerson(personIdRef.current);
      if (existing) {
        const unionAnswered = Array.from(new Set([...existing.history.answered_node_ids, ...answeredFromSession]));
        savePerson({
          ...existing,
          profile: profileSnapshot,
          history: {
            ...existing.history,
            answered_node_ids: unionAnswered,
          },
        });
      }
    }

    // Save the active session so resume works mid-visit.
    saveActiveSession({
      ...session,
      person_id: personIdRef.current ?? undefined,
      engine: state,
    });
  }, [state, session]);

  // ─── close: fold visit into Person, hand off seer ─────
  useEffect(() => {
    if (state.stage === 'reading_ready' && seer && persistedFor.current !== state.session_id) {
      persistLog(state, null);
      persistedFor.current = state.session_id;

      // Finalize: append this completed visit to the Person record.
      const pid = personIdRef.current;
      if (pid) {
        const visit: VisitRecord = {
          visit_id: state.session_id,
          started_at: state.started_at,
          completed_at: Date.now(),
          intention: state.chosen_intention ?? undefined,
          answered_node_ids: state.picks_log.map((p) => p.node_id),
        };
        appendVisitToPerson({
          person_id: pid,
          profile: cloneProfile(state.profile),
          visit,
        });
      }
      clearActiveSession();
    }
  }, [state.stage, seer, state]);

  function handleEnter() {
    if (!seer) return;
    onComplete(seer);
  }

  // ─── existing side effects (dizzy, debug) ─────────────
  useEffect(() => {
    setDizzy(state.thinking);
  }, [state.thinking]);
  useEffect(() => () => setDizzy(false), []);

  useEffect(() => {
    publishDebug('survey.thinking', state.thinking);
    publishDebug('survey.picks', state.picks_log.length);
    publishDebug('survey.queue', state.queue.map((q) => q.node_id).join(','));
    publishDebug('survey.asked', state.asked_node_ids.join(','));
    publishDebug('survey.person', personIdState ?? '');
  }, [state.thinking, state.picks_log.length, state.queue, state.asked_node_ids, personIdState]);
  useEffect(() => () => {
    clearDebug('survey.thinking');
    clearDebug('survey.picks');
    clearDebug('survey.queue');
    clearDebug('survey.asked');
    clearDebug('survey.inflight');
    clearDebug('survey.person');
  }, []);

  // ─── render ───────────────────────────────────────────

  const stage = state.stage;
  const isAwaitingIntention = stage === 'awaiting_intention';
  const isCompiling = stage === 'compiling';

  // Gag interlude — interrupt exactly once, when the user has answered
  // 12 post-opener questions and a 13th is queued. Pure UI; the engine
  // is unaware. `gagShown` flips after the user clicks/types-and-dismisses,
  // and from there the queued 13th renders normally.
  const [gagShown, setGagShown] = useState(false);
  const postOpenerCount = useMemo(
    () => state.picks_log.filter((p) =>
      !['name', 'birthday', 'relationship', 'intent'].includes(p.node_id),
    ).length,
    [state.picks_log],
  );
  const showGag =
    !gagShown
    && postOpenerCount === 12
    && stage === 'questions'
    && currentQuestion !== null;
  const showReady =
    stage === 'questions' &&
    state.picks_log.length >= READY_BUTTON_MIN_TURNS &&
    !!currentQuestion;

  // Last intention from prior visits — soft hint near the intention picker.
  const lastIntention = state.prior_intentions[0] ?? null;

  let dialogText = '';
  let dialogKey = 'empty';
  if (returnLine) {
    dialogText = returnLine;
    dialogKey = 'return-line';
  } else if (pendingMatches) {
    dialogText = 'wait. let me look at you.';
    dialogKey = 'returning-check';
  } else if (isAwaitingIntention) {
    dialogText = "finally. what answers dost thou seek from the oracle, traveler?";
    dialogKey = 'intention';
  } else if (isCompiling) {
    dialogText = 'the seer is preparing.';
    dialogKey = 'compiling';
  } else if (showGag) {
    // Gag dialogue: NO question mark per spec. green color via host class.
    dialogText = 'which is the best animal';
    dialogKey = 'gag-animal';
  } else if (currentQuestion) {
    dialogText = currentQuestion.preamble
      ? `${currentQuestion.preamble.toLowerCase()}\n${currentQuestion.text.toLowerCase()}`
      : currentQuestion.text.toLowerCase();
    dialogKey = currentQuestion.node_id;
  } else if (state.thinking) {
    dialogText = '…';
    dialogKey = 'thinking';
  }

  // Clear the return line one tick after it's shown, so the next
  // question's preamble takes over the dialogue slot.
  useEffect(() => {
    if (!returnLine) return;
    const t = setTimeout(() => setReturnLine(null), 2200);
    return () => clearTimeout(t);
  }, [returnLine]);

  const modalOpen = pendingMatches !== null;
  // The intent opener (and the closing IntentConfirm) get a red treatment
  // to flag the question-sandwich as user-driven rather than system-driven.
  const isIntentMoment = currentQuestion?.node_id === 'intent' || isAwaitingIntention;

  return (
    <div className="screen screen--survey">
      <Reader isSpeaking={speaking} />

      <div className={
        showGag
          ? 'survey__dialogue-host survey__dialogue-host--gag'
          : isIntentMoment
            ? 'survey__dialogue-host survey__dialogue-host--intent'
            : 'survey__dialogue-host'
      }>
        {sensing ? (
          <SensingLine name={sensing.name} color={sensing.color} />
        ) : (
          <Dialogue
            key={dialogKey}
            text={dialogText}
            onTypingChange={setSpeaking}
          />
        )}
      </div>

      <div className="ui-frame ui-frame--survey">
        <div className="ui-frame__choices">
          {showGag && (
            <GagQuestion onDismiss={() => setGagShown(true)} />
          )}

          {!showGag && !modalOpen && currentQuestion?.format === 'text' && (
            <NameForm
              existingNames={existingNames}
              onSubmit={(name) => void handleNameSubmit(name)}
            />
          )}

          {!showGag && !modalOpen && currentQuestion?.format === 'date' && (
            <BirthdayForm onSubmit={(iso) => void submitAnswer(iso)} />
          )}

          {!showGag && !modalOpen && currentQuestion?.format === 'matrix' && currentQuestion.axes && (
            <Matrix2x2Choice
              key={currentQuestion.node_id}
              axes={{ x: currentQuestion.axes[0], y: currentQuestion.axes[1] }}
              options={currentQuestion.options}
              onPick={(v) => void submitAnswer(v)}
            />
          )}

          {!showGag && !modalOpen && currentQuestion &&
            (currentQuestion.format === 'choice' || currentQuestion.format === 'binary') && (
            <MultipleChoice
              key={currentQuestion.node_id}
              suggestions={currentQuestion.options}
              isBinary={currentQuestion.format === 'binary'}
              onPick={(v) => void submitAnswer(v)}
            />
          )}

          {!showGag && !modalOpen && currentQuestion?.format === 'relationship_status' && (
            <RelationshipStatusForm onPick={(v) => void submitAnswer(v)} />
          )}

          {!showGag && !modalOpen && currentQuestion?.format === 'intent' && (
            <IntentForm onNotYet={() => void submitAnswer('')} />
          )}

          {!showGag && !modalOpen && currentQuestion?.format === 'relationship_pick' && (
            <RelationshipPickForm
              cast={state.profile.cast}
              onSubmit={(encoded) => {
                setSensing(null);
                void submitAnswer(encoded);
              }}
              onSensingChange={setSensing}
            />
          )}

          {isCompiling && (
            <div className="ui-frame__waiting"><Spinner label="preparing" /></div>
          )}

          {!currentQuestion && !isCompiling && !isAwaitingIntention && state.thinking && (
            <div className="ui-frame__waiting"><Spinner label="thinking" /></div>
          )}

          {isAwaitingIntention && (
            <div className="survey__intentions">
              {lastIntention && (
                <p className="survey__last-intention">
                  last time you asked: <em>{lastIntention}</em>
                </p>
              )}
              <IntentConfirm
                initialIntention={state.profile.initial_intention}
                onSubmit={(text) => submitIntention(text)}
              />
            </div>
          )}
        </div>
      </div>

      {!showGag && !modalOpen && stage === 'questions' && currentQuestion
        && currentQuestion.format !== 'text'
        && currentQuestion.format !== 'date'
        && currentQuestion.format !== 'relationship_pick'
        && currentQuestion.format !== 'relationship_status'
        && (
        <div className="survey__chat-slot">
          <ChatInput
            placeholder={
              currentQuestion.format === 'intent'
                ? 'type your question for the cards…'
                : 'or type your own answer'
            }
            disabled={false}
            onSend={(text) => void submitAnswer(text)}
          />
        </div>
      )}
      {isAwaitingIntention && (
        <div className="survey__chat-slot">
          <ChatInput
            placeholder="or say it the way you'd say it to a friend"
            disabled={false}
            onSend={(text) => submitIntention(text)}
          />
        </div>
      )}

      <div className="survey__footer">
        {showReady && (
          <button
            className="btn btn--quiet survey__ready"
            onClick={skipAhead}
            title="end the survey and proceed to the reading"
          >
            ready for the cards →
          </button>
        )}
        {state.stage === 'reading_ready' && seer && (
          <button
            className="btn btn--big survey__enter"
            onClick={handleEnter}
            title="enter the tent — the seer is ready for you."
          >
            ENTER
          </button>
        )}
        {isCompiling && (
          <button
            className="btn btn--quiet"
            onClick={() => downloadTranscript(state)}
          >
            download transcript
          </button>
        )}
      </div>

      {pendingMatches && (
        <ReturningUserModal
          name={state.profile.name}
          matches={pendingMatches}
          onResume={handleResume}
          onStartFresh={handleStartFresh}
        />
      )}
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────

/** Save threshold predicate: a Person record is only written once the
 *  identifying openers are filled (name, birthday, birth_time, intent).
 *  The intent slot is counted via `asked_node_ids` because `initial_intention`
 *  can legitimately be null (user pressed "I DON'T KNOW"). */
function allOpenersAnswered(profile: SurveyProfile, askedNodeIds: string[]): boolean {
  return (
    profile.name.trim().length > 0 &&
    profile.birthday !== null &&
    profile.birth_time_bracket !== null &&
    askedNodeIds.includes('intent')
  );
}

function cloneProfile(p: SurveyProfile): SurveyProfile {
  return JSON.parse(JSON.stringify(p)) as SurveyProfile;
}

/** The mascot's "i'm sensing... a [NAME]" line, rendered in the dialogue
 *  slot instead of the original question while the user is typing a
 *  relationship_pick name. Uses .dialogue-stage so it inherits the same
 *  visual frame as the normal Dialogue — but bypasses the typewriter
 *  (instant render) so the [NAME] reflects keystrokes in real time. */
function SensingLine({ name, color }: { name: string; color: string }) {
  return (
    <div
      className="dialogue-stage dialogue-stage--instant"
      role="region"
      aria-live="polite"
    >
      <span className="dialogue-text dialogue-text--instant">
        {"i'm sensing... a "}
        <span
          className="sensing-name"
          style={{ color }}
        >
          {name.toUpperCase()}
        </span>
      </span>
    </div>
  );
}
