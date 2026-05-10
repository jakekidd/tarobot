import { useState } from 'react';
import { drawForSpread, FOUR_CARD_DIAMOND } from './pipeline';
import type {
  BaseProfile,
  DrawnCards,
  EnrichedProfile,
  Reading as ReadingT,
  Survey as SurveyData,
} from './pipeline';
import {
  archiveActive,
  clearActive,
  listProfilesByName,
  loadApiKey,
  newSession,
  saveActive,
  type Session,
} from './storage';
import { KeyEntry } from './ui/KeyEntry';
import { Menu } from './ui/Menu';
import { PastReadings } from './ui/PastReadings';
import { Settings } from './ui/Settings';
import { Survey } from './ui/Survey';
import { Interview } from './ui/Interview';
import { Placement } from './ui/Placement';
import { Reading } from './ui/Reading';
import { Closing } from './ui/Closing';

type Phase =
  | { kind: 'key' }
  | { kind: 'menu' }
  | { kind: 'past' }
  | { kind: 'settings' }
  | { kind: 'survey'; session: Session }
  | { kind: 'interview'; session: Session; base: BaseProfile }
  | { kind: 'placement'; session: Session; profile: EnrichedProfile; drawn: DrawnCards }
  | { kind: 'reading'; session: Session; profile: EnrichedProfile; drawn: DrawnCards; reading: ReadingT }
  | { kind: 'closing'; session: Session; profile: EnrichedProfile; reading: ReadingT };

export function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => loadApiKey());
  const [phase, setPhase] = useState<Phase>(() =>
    loadApiKey() ? { kind: 'menu' } : { kind: 'key' },
  );
  const [debugOpen, setDebugOpen] = useState(false);

  // ─── Transitions ──────────────────────────────────────

  function goMenu() {
    setPhase({ kind: 'menu' });
  }

  function startNewReading() {
    clearActive();
    const s = newSession();
    saveActive(s);
    setPhase({ kind: 'survey', session: s });
  }

  function resumeSession(s: Session) {
    // For MVP, resume jumps to the phase the session was last in.
    // Phases that need work-in-progress data (interview history, drawn cards,
    // reading) read it back out of the session blob themselves.
    switch (s.phase) {
      case 'survey':
        setPhase({ kind: 'survey', session: s });
        return;
      case 'interview':
      case 'finalizing':
        if (!s.base_profile) {
          // corrupted state — start over
          clearActive();
          goMenu();
          return;
        }
        setPhase({ kind: 'interview', session: s, base: s.base_profile });
        return;
      case 'placement':
        if (!s.profile || !s.drawn) { clearActive(); goMenu(); return; }
        setPhase({ kind: 'placement', session: s, profile: s.profile, drawn: s.drawn });
        return;
      case 'reading':
        if (!s.profile || !s.drawn || !s.reading) { clearActive(); goMenu(); return; }
        setPhase({ kind: 'reading', session: s, profile: s.profile, drawn: s.drawn, reading: s.reading });
        return;
      case 'closing':
        if (!s.profile || !s.reading) { clearActive(); goMenu(); return; }
        setPhase({ kind: 'closing', session: s, profile: s.profile, reading: s.reading });
        return;
      default:
        clearActive();
        goMenu();
    }
  }

  function onSurveyComplete(session: Session, survey: SurveyData) {
    const base: BaseProfile = { survey, started_at: session.started_at };
    const next: Session = { ...session, phase: 'interview', base_profile: base };
    saveActive(next);
    setPhase({ kind: 'interview', session: next, base });
  }

  function onUseExistingProfile(session: Session, profile: EnrichedProfile) {
    // Skip survey + interview entirely; go straight to a fresh card draw.
    const drawn = drawForSpread(FOUR_CARD_DIAMOND);
    const next: Session = {
      ...session,
      phase: 'placement',
      base_profile: { survey: profile.survey, started_at: session.started_at },
      profile,
      drawn,
    };
    saveActive(next);
    setPhase({ kind: 'placement', session: next, profile, drawn });
  }

  function onInterviewFinalized(session: Session, profile: EnrichedProfile) {
    const drawn = drawForSpread(FOUR_CARD_DIAMOND);
    const next: Session = { ...session, phase: 'placement', profile, drawn };
    saveActive(next);
    setPhase({ kind: 'placement', session: next, profile, drawn });
  }

  function onPlacementReady(session: Session, reading: ReadingT) {
    const next: Session = { ...session, phase: 'reading', reading };
    saveActive(next);
    setPhase({
      kind: 'reading',
      session: next,
      profile: session.profile!,
      drawn: session.drawn!,
      reading,
    });
  }

  function onReadingComplete(session: Session) {
    const next: Session = { ...session, phase: 'closing' };
    saveActive(next);
    setPhase({
      kind: 'closing',
      session: next,
      profile: session.profile!,
      reading: session.reading!,
    });
  }

  function onClosingDone(session: Session) {
    archiveActive(session);
    setPhase({ kind: 'menu' });
  }

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="app">
      <header className="app__topbar">
        <span className="app__brand">tarobot</span>
        <div className="app__topbar-actions">
          {phase.kind === 'interview' && (
            <button
              className={`btn btn--quiet ${debugOpen ? 'btn--quiet-on' : ''}`}
              onClick={() => setDebugOpen((v) => !v)}
              title="show cognition state"
            >
              {debugOpen ? '◀ debug' : 'debug ▶'}
            </button>
          )}
          {phase.kind !== 'menu' && phase.kind !== 'key' && (
            <button className="btn btn--quiet" onClick={goMenu}>
              quit to menu
            </button>
          )}
        </div>
      </header>

      <main className={`app__main ${phase.kind === 'interview' ? 'app__main--full' : ''}`}>
        {phase.kind === 'key' && (
          <KeyEntry onValidated={(k) => { setApiKey(k); goMenu(); }} />
        )}

        {phase.kind === 'menu' && (
          <Menu
            onBegin={startNewReading}
            onResume={resumeSession}
            onViewPast={() => setPhase({ kind: 'past' })}
            onSettings={() => setPhase({ kind: 'settings' })}
          />
        )}

        {phase.kind === 'past' && (
          <PastReadings onBack={goMenu} />
        )}

        {phase.kind === 'settings' && (
          <Settings onBack={goMenu} />
        )}

        {phase.kind === 'survey' && (
          <Survey
            onComplete={(s) => onSurveyComplete(phase.session, s)}
            onCancel={goMenu}
            existingProfiles={listProfilesByName()}
            onUseExistingProfile={(p) => onUseExistingProfile(phase.session, p)}
          />
        )}

        {phase.kind === 'interview' && apiKey && (
          <Interview
            apiKey={apiKey}
            base={phase.base}
            onFinalized={(p) => onInterviewFinalized(phase.session, p)}
            onCancel={goMenu}
            debugOpen={debugOpen}
            onCloseDebug={() => setDebugOpen(false)}
          />
        )}

        {phase.kind === 'placement' && apiKey && (
          <Placement
            apiKey={apiKey}
            profile={phase.profile}
            drawn={phase.drawn}
            onReady={(r) => onPlacementReady(phase.session, r)}
            onCancel={goMenu}
          />
        )}

        {phase.kind === 'reading' && (
          <Reading
            profile={phase.profile}
            drawn={phase.drawn}
            reading={phase.reading}
            onComplete={() => onReadingComplete(phase.session)}
            onCancel={goMenu}
          />
        )}

        {phase.kind === 'closing' && (
          <Closing
            profile={phase.profile}
            reading={phase.reading}
            drawn={phase.session.drawn}
            onDone={() => onClosingDone(phase.session)}
          />
        )}
      </main>
    </div>
  );
}
