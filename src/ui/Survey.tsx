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
import { AssertionChoice } from './choices/AssertionChoice';
import { ForkChoice } from './choices/ForkChoice';
import { Spinner } from './Spinner';
import { BirthdayForm } from './survey/BirthdayForm';
import {
  CENTENARIAN_THRESHOLD,
  ageFromBirthday,
  buildCentenarianLine,
} from './survey/centenarian';
import { parseBirthDate } from '../pipeline/astrology';
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
  deletePerson,
  listKnownNames,
  prependIntentionToPerson,
  savePersonFromFinalState,
  type Person,
  type Session,
} from '../storage';
import { findPeopleMatchingName, type ReturningMatch } from '../pipeline/survey';
import type { Seer } from '../pipeline/seer';
import type { SurveyProfile } from '../pipeline/survey';
import { publishDebug, clearDebug } from '../debug/debugBus';
import { publishSurveyState } from '../debug/surveyStateBus';
import { ChatInput } from './ChatInput';
import { UndoIcon } from './icons/UndoIcon';
import { setCardsActive } from './scene/cardsScopeStore';
import { fireBurnCard } from './scene/burnCardStore';
import {
  subscribeMascotDisintegrateComplete,
  triggerMascotDisintegrate,
} from './scene/disintegrateStore';

const READY_BUTTON_MIN_TURNS = 6;

type Props = {
  apiKey: string;
  session: Session;
  /** When non-null, the engine hydrates from this Person record and
   *  jumps straight to the intention question — no survey, no
   *  synthesis, no save. The "load" path. */
  loadedPerson?: Person | null;
  /** Survey hands off a ready Seer (intro pre-built) instead of a brief. */
  onComplete: (seer: Seer) => void;
};

export function Survey({ apiKey, session, loadedPerson, onComplete }: Props) {
  const { state, currentQuestion, submitAnswer, submitIntention, skipAhead, canUndo, undo, seer, engine } = useSurveyEngine({
    apiKey,
    sessionId: session.id,
  });

  // Loaded-from-save bootstrap: on mount, if we have a saved Person,
  // hydrate the engine directly and skip the survey.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    if (loadedPerson) {
      engine.loadFromSave({
        profile: loadedPerson.profile,
        doc: loadedPerson.doc,
        anchor: loadedPerson.anchor,
        verbatim_log: loadedPerson.verbatim_log,
        picks_log: loadedPerson.picks_log,
        timing_log: loadedPerson.timing_log,
        prior_intentions: loadedPerson.intentions,
      });
    }
  }, [engine, loadedPerson]);

  const [speaking, setSpeaking] = useState(false);
  const persistedFor = useRef<string | null>(null);

  // v3 assertion stall: when the user answers an assertion, the mascot
  // speaks the detective's pre-baked comment_if_<answer> for ~2 seconds
  // before the next question's dialogue takes over. Zero LLM latency on
  // the user-facing acknowledgement — the comment was shipped with the
  // instrument. The choice widgets advance immediately under the
  // dialogue; only the spoken line is held.
  const [assertionStall, setAssertionStall] = useState<{ text: string; ts: number } | null>(null);
  useEffect(() => {
    if (!assertionStall) return;
    const t = window.setTimeout(() => setAssertionStall(null), 2200);
    return () => window.clearTimeout(t);
  }, [assertionStall]);

  // Centenarian interlude: when the user enters a birthyear that makes
  // them >100, hang the lamp with a sassy compound comment before
  // continuing to the relationship_status opener. Single stage — the
  // dialogue plays, a "click to continue" indicator appears once it
  // finishes typing, user taps to advance.
  const [centenarian, setCentenarian] = useState<{ iso: string; line: string } | null>(null);
  const [centenarianReady, setCentenarianReady] = useState(false);

  function handleBirthdaySubmit(iso: string): void {
    const parsed = parseBirthDate(iso);
    if (!parsed) {
      void submitAnswer(iso);
      return;
    }
    const age = ageFromBirthday(parsed);
    if (age > CENTENARIAN_THRESHOLD) {
      setCentenarianReady(false);
      setCentenarian({
        iso,
        line: buildCentenarianLine(age, parsed.year),
      });
      return;
    }
    void submitAnswer(iso);
  }

  function advancePastCentenarian(): void {
    if (!centenarian) return;
    const iso = centenarian.iso;
    setCentenarian(null);
    setCentenarianReady(false);
    void submitAnswer(iso);
  }

  // Farewell substate. After the user clicks ENTER on the reading_ready
  // screen we play a slow goodbye line, then trigger the mascot to
  // disintegrate. Once both finish, the held Seer is handed to App for
  // the Reading transition.
  //   idle         — survey still in normal flow
  //   speaking     — goodbye dialogue typing out (quarter speed)
  //   disintegrating — turtle dissolving toe-to-head
  type FarewellState = 'idle' | 'speaking' | 'disintegrating';
  const [farewell, setFarewell] = useState<FarewellState>('idle');
  const seerRef = useRef<Seer | null>(null);

  // Confirmation substate — runs between awaiting_intention transition
  // and the IntentConfirm UI. New-completion path shows the green
  // "✓ Your survey results have been saved." line; loaded path shows
  // "Welcome back, <name>." Both wait 2.5s AFTER the typewriter
  // finishes before letting IntentConfirm render.
  type ConfirmState = 'pending' | 'typing' | 'holding' | 'done';
  // For LOADED runs the kind is known up-front (welcoming); for fresh
  // runs it's set when the engine flips finalizing → awaiting_intention
  // (in the save-once effect below).
  const [confirm, setConfirm] = useState<ConfirmState>(loadedPerson ? 'typing' : 'pending');
  const [confirmKind, setConfirmKind] = useState<'saving' | 'welcoming' | null>(
    loadedPerson ? 'welcoming' : null,
  );
  const personIdRef = useRef<string | null>(loadedPerson?.id ?? null);

  // Orbiting-cards scope: this subsystem is global (mounted in App via
  // TarobotScene) but should ONLY render cards while a survey is active.
  // Toggle on mount/unmount — cards fade out gracefully on unmount.
  useEffect(() => {
    setCardsActive(true);
    return () => { setCardsActive(false); };
  }, []);

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
  // (returning-user "welcome back" line is now handled by the
  //  confirmation substate above — see confirmKind === 'welcoming'.)

  // ─── relationship_pick: "i'm sensing..." mascot line ───
  // Set by RelationshipPickForm via callback while the user is typing
  // a name. While non-null, the dialogue box replaces the original
  // question with the sensing line (voiced by the mascot, instant,
  // colored to the name's accent).
  const [sensing, setSensing] = useState<{ name: string; color: string } | null>(null);

  function handleResume(match: ReturningMatch) {
    // RESUME on the name-match modal: hydrate the engine from the
    // saved snapshot (skip the survey, jump to intention prompt).
    // Mirrors the LOAD button in ResumeMenu.
    engine.loadFromSave({
      profile: match.profile,
      doc: match.doc,
      anchor: match.anchor,
      verbatim_log: match.verbatim_log,
      picks_log: match.picks_log,
      timing_log: match.timing_log,
      prior_intentions: match.prior_intentions,
    });
    personIdRef.current = match.person_id;
    setConfirmKind('welcoming');
    setConfirm('typing');
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

  // ─── save-once persistence ───────────────────────────
  // The Person record is written EXACTLY ONCE per survey: at the moment
  // the engine transitions finalizing → awaiting_intention (the synthesis
  // is done, the snapshot is final). Save games are immutable from that
  // point — a returning visitor LOADs them, asks a different intention,
  // and gets a fresh reading from the same survey state.
  //
  // Loaded sessions skip this entirely (loadedPerson is non-null).
  const savedThisSession = useRef(false);
  useEffect(() => {
    if (loadedPerson) return;                     // load path doesn't save
    if (savedThisSession.current) return;
    if (state.stage !== 'awaiting_intention') return;
    if (!state.profile.name) return;              // need at least a name
    savedThisSession.current = true;
    const person = savePersonFromFinalState({
      profile: cloneProfile(state.profile),
      doc: JSON.parse(JSON.stringify(state.doc)) as typeof state.doc,
      anchor: state.anchor,
      verbatim_log: [...state.verbatim_log],
      picks_log: [...state.picks_log],
      timing_log: [...state.timing_log],
    });
    personIdRef.current = person.id;
    // setState here is the legitimate downstream of the side-effect
    // (Person write). Both flips coordinate the confirmation dialogue;
    // they don't drive a re-derivable visible state.
    /* eslint-disable react-hooks/set-state-in-effect */
    setConfirmKind('saving');
    setConfirm('typing');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadedPerson, state.stage, state]);

  // ─── close: hand off seer + record intention against Person ───
  useEffect(() => {
    if (state.stage === 'reading_ready' && seer && persistedFor.current !== state.session_id) {
      persistLog(state, null);
      persistedFor.current = state.session_id;
      if (personIdRef.current && state.chosen_intention) {
        prependIntentionToPerson(personIdRef.current, state.chosen_intention);
      }
    }
  }, [state.stage, seer, state]);

  function handleEnter() {
    if (!seer || farewell !== 'idle') return;
    // Stash the seer reference — the engine state could shift before
    // disintegration completes, and onComplete needs the same Seer
    // instance.
    seerRef.current = seer;
    setFarewell('speaking');
  }

  // Wire the disintegrate completion → seer handoff.
  useEffect(() => {
    const unsub = subscribeMascotDisintegrateComplete(() => {
      const s = seerRef.current;
      if (s) onComplete(s);
    });
    return unsub;
  }, [onComplete]);

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
    publishDebug('survey.person', personIdRef.current ?? '');
    publishSurveyState(state);
  }, [state, state.thinking, state.picks_log.length, state.queue, state.asked_node_ids]);

  // Clear the bus snapshot when Survey unmounts.
  useEffect(() => () => publishSurveyState(null), []);
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
  const isFinalizing = stage === 'finalizing';
  const isAwaitingIntention = stage === 'awaiting_intention';
  const isCompiling = stage === 'compiling';
  const isNullLanding = stage === 'null_landing';
  // While the confirmation dialogue is on-screen (saving / welcoming),
  // suppress the IntentConfirm widget below.
  const isConfirming = confirm === 'typing' || confirm === 'holding';

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
  // GAG_ENABLED — hidden for now. Re-enable when we have a randomized
  // policy for inserting the joke question (currently it triggers
  // deterministically at postOpenerCount === 12 which feels canned).
  const GAG_ENABLED = false;
  const showGag =
    GAG_ENABLED
    && !gagShown
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
  let dialogClass: string | undefined;
  if (farewell !== 'idle') {
    dialogText = 'ok. have fun, be safe. goodbye';
    dialogKey = 'farewell';
  } else if (pendingMatches) {
    dialogText = 'wait. let me look at you.';
    dialogKey = 'returning-check';
  } else if (isConfirming) {
    // Green-text save / welcome confirmation. Holds 2.5s after typewriter
    // before IntentConfirm renders (handled in the onDone effect chain).
    if (confirmKind === 'welcoming') {
      const nm = (loadedPerson?.profile?.name || state.profile.name || 'traveler').toLowerCase();
      dialogText = `welcome back, ${nm}.`;
      dialogKey = 'confirm-welcome';
    } else {
      dialogText = '✓ your survey results have been saved.';
      dialogKey = 'confirm-saved';
    }
    dialogClass = 'dialogue-text--confirmation';
  } else if (isFinalizing) {
    dialogText = 'sitting with what you told me.';
    dialogKey = 'finalizing';
  } else if (isAwaitingIntention) {
    // Dialogue carries the prompt for IntentConfirm now — the form below
    // is just the input + confirm button (no duplicate text).
    dialogText = state.profile.initial_intention
      ? "the question you arrived with. is it still the one you wish to ask?"
      : "do you have a question for the cards now?";
    dialogKey = 'intention';
  } else if (isCompiling) {
    dialogText = 'the seer is preparing.';
    dialogKey = 'compiling';
  } else if (isNullLanding) {
    // v3: dead-end signals fired during the survey. The reading would
    // be manufacturing where there's nothing to manufacture. Land it
    // gracefully — no intention prompt, no augur, no seer. The user
    // can EXIT from the topbar. (Phase 2+ plan flags a "light reading"
    // mode in the seer as out of scope for this refactor.)
    dialogText = "nothing's pulling at you today. that's its own kind of reading. come back if something does.";
    dialogKey = 'null-landing';
  } else if (assertionStall) {
    // v3 mascot stall: hold the dialogue on the detective's pre-baked
    // comment_if_<answer> for a beat after an assertion answer. Zero
    // LLM latency on the user-facing acknowledgement. Cleared by the
    // useEffect timer (~2.2s).
    dialogText = assertionStall.text.toLowerCase();
    dialogKey = `stall-${assertionStall.ts}`;
  } else if (centenarian) {
    // Centenarian compound line. Stays on screen; a tap-to-continue
    // indicator appears once it finishes typing (see below).
    dialogText = centenarian.line;
    dialogKey = 'centenarian-compound';
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

  const modalOpen = pendingMatches !== null;
  // The intent opener (and the closing IntentConfirm) get a red treatment
  // to flag the question-sandwich as user-driven rather than system-driven.
  const isIntentMoment = currentQuestion?.node_id === 'intent' || isAwaitingIntention;

  return (
    <div className="screen screen--survey">
      <Reader isSpeaking={speaking} />

      {/* Undo chevron — top-left, anchored away from the choices block
          so the user can't fat-thumb it. Renders only when there's a
          snapshot to restore AND the engine isn't mid-think. */}
      {canUndo && farewell === 'idle' && state.stage === 'questions' && (
        <button
          type="button"
          className="survey__undo"
          onClick={() => {
            setSensing(null);  // clear sensing overlay if active
            fireBurnCard();    // burn the most recent orbiting card
            undo();
          }}
          disabled={state.thinking}
          title="undo last answer"
          aria-label="undo last answer"
        >
          <UndoIcon size="1.4rem" />
        </button>
      )}

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
            className={dialogClass}
            // Quarter speed during the farewell — the goodbye lands
            // slowly, gives the user a moment before the turtle goes.
            charDelayMs={farewell === 'speaking' || farewell === 'disintegrating' ? 112 : undefined}
            // Disable click-skip on the farewell + confirmation — let
            // them play out so the timing reads right.
            clickToSkip={farewell === 'idle' && !isConfirming}
            onTypingChange={setSpeaking}
            onDone={
              farewell === 'speaking'
                ? () => {
                    setFarewell('disintegrating');
                    triggerMascotDisintegrate();
                  }
                : isConfirming
                ? () => {
                    setConfirm('holding');
                    window.setTimeout(() => setConfirm('done'), 2500);
                  }
                : centenarian
                ? () => setCentenarianReady(true)
                : undefined
            }
          />
        )}
      </div>

      <div className="ui-frame ui-frame--survey">
        <div className="ui-frame__choices">
          {showGag && (
            <GagQuestion onDismiss={() => setGagShown(true)} />
          )}

          {/* Intent question (sandwich opener): text entry FIRST, NOT
              YET button SECOND. Documented exception to the general
              "text input last" rule. */}
          {!showGag && !modalOpen && currentQuestion?.format === 'intent' && (
            <>
              <div className="ui-frame__custom-input ui-frame__custom-input--intent">
                <ChatInput
                  placeholder="type your question for the cards…"
                  disabled={false}
                  onSend={(text) => void submitAnswer(text)}
                />
              </div>
              <IntentForm onNotYet={() => void submitAnswer('')} />
            </>
          )}

          {!showGag && !modalOpen && currentQuestion?.format === 'text' && (
            <NameForm
              existingNames={existingNames}
              onSubmit={(name) => void handleNameSubmit(name)}
            />
          )}

          {!showGag && !modalOpen && currentQuestion?.format === 'date' && !centenarian && (
            <BirthdayForm onSubmit={handleBirthdaySubmit} />
          )}

          {centenarian && centenarianReady && (
            <button
              type="button"
              className="centenarian-continue"
              onClick={advancePastCentenarian}
              aria-label="continue"
            >
              <span className="centenarian-continue__arrow">▾</span>
            </button>
          )}

          {!showGag && !modalOpen && currentQuestion?.format === 'matrix' && currentQuestion.axes && (
            <>
              <Matrix2x2Choice
                key={currentQuestion.node_id}
                axes={{ x: currentQuestion.axes[0], y: currentQuestion.axes[1] }}
                options={currentQuestion.options}
                onPick={(v) => void submitAnswer(v)}
              />
              <div className="ui-frame__custom-input">
                <ChatInput
                  placeholder="or type your own answer"
                  disabled={false}
                  onSend={(text) => void submitAnswer(text)}
                />
              </div>
            </>
          )}

          {!showGag && !modalOpen && currentQuestion &&
            (currentQuestion.format === 'choice' || currentQuestion.format === 'binary') && (
            <>
              <MultipleChoice
                key={currentQuestion.node_id}
                suggestions={currentQuestion.options}
                isBinary={currentQuestion.format === 'binary'}
                onPick={(v) => void submitAnswer(v)}
              />
              <div className="ui-frame__custom-input">
                <ChatInput
                  placeholder="or type your own answer"
                  disabled={false}
                  onSend={(text) => void submitAnswer(text)}
                />
              </div>
            </>
          )}

          {!showGag && !modalOpen && currentQuestion?.format === 'fork' && (
            <ForkChoice
              key={currentQuestion.node_id}
              options={currentQuestion.options}
              onPick={(v) => void submitAnswer(v)}
            />
          )}

          {!showGag
            && !modalOpen
            && currentQuestion?.format === 'assertion'
            && currentQuestion.instrument?.kind === 'assertion' && (
            <AssertionChoice
              key={currentQuestion.node_id}
              correction_inversions={currentQuestion.instrument.correction_inversions}
              onPick={(v) => {
                const inst = currentQuestion.instrument;
                if (inst?.kind === 'assertion') {
                  const isTrue = v === 'true';
                  const stall = isTrue ? inst.comment_if_true : inst.comment_if_false;
                  if (stall) setAssertionStall({ text: stall, ts: Date.now() });
                }
                void submitAnswer(v);
              }}
            />
          )}

          {!showGag && !modalOpen && currentQuestion?.format === 'relationship_status' && (
            <RelationshipStatusForm onPick={(v) => void submitAnswer(v)} />
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

          {isAwaitingIntention && confirm === 'done' && (
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
        {state.stage === 'reading_ready' && seer && farewell === 'idle' && (
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

function cloneProfile(p: SurveyProfile): SurveyProfile {
  return JSON.parse(JSON.stringify(p)) as SurveyProfile;
}

/** The mascot's "i'm sensing... a [NAME]" line, rendered in the dialogue
 *  slot instead of the original question while the user is typing a
 *  relationship_pick name. Uses .dialogue-stage so it inherits the same
 *  visual frame as the normal Dialogue — but bypasses the typewriter
 *  (instant render) so the [NAME] reflects keystrokes in real time. */
function SensingLine({ name, color }: { name: string; color: string }) {
  const article = /^[aeiou]/i.test(name.trim()) ? 'an' : 'a';
  return (
    <div
      className="dialogue-stage dialogue-stage--instant"
      role="region"
      aria-live="polite"
    >
      <span className="dialogue-text dialogue-text--instant">
        {`i'm sensing... ${article} `}
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
