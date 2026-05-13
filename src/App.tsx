import { useState } from 'react';
import type { Profile, Question, Survey } from './pipeline';
import {
  archiveActive,
  clearActive,
  loadApiKey,
  newSession,
  saveActive,
  type Session,
} from './storage';
import { KeyEntry } from './ui/KeyEntry';
import { Menu } from './ui/Menu';
import { Settings } from './ui/Settings';
import { Survey as SurveyScreen } from './ui/Survey';
import { Compiling } from './ui/Compiling';
import { EnterTent } from './ui/EnterTent';
import { Tent } from './ui/Tent';

type Phase =
  | { kind: 'key' }
  | { kind: 'menu' }
  | { kind: 'settings' }
  | { kind: 'survey'; session: Session }
  | { kind: 'compiling'; session: Session; survey: Survey }
  | { kind: 'enter-tent'; session: Session; survey: Survey; profile: Profile; openers: Question[] }
  | { kind: 'tent'; session: Session; survey: Survey; profile: Profile; openers: Question[] };

export function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => loadApiKey());
  const [phase, setPhase] = useState<Phase>(() =>
    loadApiKey() ? { kind: 'menu' } : { kind: 'key' },
  );
  const [debugOpen, setDebugOpen] = useState(false);

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
    // For MVP: we restore to whichever phase the session was last in,
    // assuming all needed inputs are present. If anything's missing,
    // fall back to a fresh start.
    switch (s.phase) {
      case 'survey':
        setPhase({ kind: 'survey', session: s });
        return;
      case 'compiling':
        if (!s.survey) { startNewReading(); return; }
        setPhase({ kind: 'compiling', session: s, survey: s.survey });
        return;
      case 'enter-tent':
        if (!s.survey || !s.profile || !s.openers) { startNewReading(); return; }
        setPhase({
          kind: 'enter-tent',
          session: s,
          survey: s.survey,
          profile: s.profile,
          openers: s.openers,
        });
        return;
      case 'tent':
        if (!s.survey || !s.profile || !s.openers) { startNewReading(); return; }
        setPhase({
          kind: 'tent',
          session: s,
          survey: s.survey,
          profile: s.profile,
          openers: s.openers,
        });
        return;
      default:
        clearActive();
        goMenu();
    }
  }

  function onSurveyComplete(session: Session, survey: Survey) {
    const next: Session = { ...session, phase: 'compiling', survey };
    saveActive(next);
    setPhase({ kind: 'compiling', session: next, survey });
  }

  function onCompiled(session: Session, survey: Survey, profile: Profile, openers: Question[]) {
    const next: Session = { ...session, phase: 'enter-tent', profile, openers };
    saveActive(next);
    setPhase({ kind: 'enter-tent', session: next, survey, profile, openers });
  }

  function onEnter(session: Session, survey: Survey, profile: Profile, openers: Question[]) {
    const next: Session = { ...session, phase: 'tent' };
    saveActive(next);
    setPhase({ kind: 'tent', session: next, survey, profile, openers });
  }

  function onQuit(session: Session) {
    archiveActive(session);
    goMenu();
  }

  return (
    <div className="app">
      <header className="app__topbar">
        <div className="app__brand-block">
          <span className="app__brand">tarobot</span>
          <span className="app__version">v0.0.1-{__APP_COMMIT__}</span>
        </div>
        <div className="app__topbar-actions">
          {phase.kind === 'tent' && (
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

      {/* CRT overlay covers the entire viewport; navbar floats above via z-index. */}
      <div className="crt-overlay" aria-hidden>
        <div className="crt__scanlines" />
        <div className="crt__vignette" />
        <div className="crt__aberration" />
        <div className="crt__flicker" />
      </div>

      <main className={`app__main ${phase.kind === 'tent' ? 'app__main--full' : ''}`}>
          {phase.kind === 'key' && (
            <KeyEntry onValidated={(k) => { setApiKey(k); goMenu(); }} />
          )}

          {phase.kind === 'menu' && (
            <Menu
              onBegin={startNewReading}
              onResume={resumeSession}
              onSettings={() => setPhase({ kind: 'settings' })}
            />
          )}

          {phase.kind === 'settings' && <Settings onBack={goMenu} />}

          {phase.kind === 'survey' && apiKey && (
            <SurveyScreen
              apiKey={apiKey}
              onComplete={(s) => onSurveyComplete(phase.session, s)}
              onCancel={goMenu}
            />
          )}

          {phase.kind === 'compiling' && apiKey && (
            <Compiling
              apiKey={apiKey}
              survey={phase.survey}
              onReady={(profile, openers) =>
                onCompiled(phase.session, phase.survey, profile, openers)
              }
              onError={() => goMenu()}
            />
          )}

          {phase.kind === 'enter-tent' && (
            <EnterTent
              onEnter={() => onEnter(phase.session, phase.survey, phase.profile, phase.openers)}
            />
          )}

          {phase.kind === 'tent' && apiKey && (
            <Tent
              apiKey={apiKey}
              survey={phase.survey}
              profile={phase.profile}
              openers={phase.openers}
              onCancel={() => onQuit(phase.session)}
              debugOpen={debugOpen}
              onCloseDebug={() => setDebugOpen(false)}
            />
          )}
        </main>
    </div>
  );
}
