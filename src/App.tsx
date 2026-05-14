import { useState } from 'react';
import type { CompilerOutput } from './pipeline/survey';
import {
  loadApiKey,
  newSession,
  saveSession,
  type Session,
} from './storage';
import { KeyEntry } from './ui/KeyEntry';
import { Menu } from './ui/Menu';
import { ResumeMenu } from './ui/ResumeMenu';
import { Settings } from './ui/Settings';
import { Survey as SurveyScreen } from './ui/Survey';
import { Reading } from './ui/Reading';
import { TarobotScene } from './ui/scene/TarobotScene';

type Phase =
  | { kind: 'key' }
  | { kind: 'menu' }
  | { kind: 'resume' }
  | { kind: 'settings' }
  | { kind: 'survey'; session: Session }
  | { kind: 'reading'; session: Session; brief: CompilerOutput };

export function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => loadApiKey());
  const [phase, setPhase] = useState<Phase>(() =>
    loadApiKey() ? { kind: 'menu' } : { kind: 'key' },
  );

  function goMenu() {
    setPhase({ kind: 'menu' });
  }

  function startNewReading() {
    const s = newSession();
    saveSession(s);
    setPhase({ kind: 'survey', session: s });
  }

  function resumeSession(s: Session) {
    switch (s.phase) {
      case 'survey':
      case 'compiling':
        setPhase({ kind: 'survey', session: s });
        return;
      // Past-survey sessions can't be resumed into a reading because the
      // brief isn't persisted (and cards are drawn fresh each time anyway).
      // Bounce to menu so the user can start a new one.
      default:
        goMenu();
    }
  }

  function onSurveyComplete(session: Session, brief: CompilerOutput) {
    const next: Session = {
      ...session,
      phase: 'tent',
      profile: brief.profile,
      openers: brief.openers,
    };
    saveSession(next);
    setPhase({ kind: 'reading', session: next, brief });
  }

  return (
    <div className="app">
      {/* Full-screen Three.js scene — renders Clat wherever a ReaderAnchor is mounted */}
      <TarobotScene />

      <header className="app__topbar">
        <div className="app__brand-block">
          <span className="app__brand">tarobot</span>
          <span className="app__version">v0.0.1-{__APP_COMMIT__}</span>
        </div>
        <div className="app__topbar-actions">
          {phase.kind !== 'menu' && phase.kind !== 'key' && (
            <button className="btn btn--quiet" onClick={goMenu}>
              exit
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

      <main className={`app__main ${phase.kind === 'reading' ? 'app__main--full' : ''}`}>
          {phase.kind === 'key' && (
            <KeyEntry onValidated={(k) => { setApiKey(k); goMenu(); }} />
          )}

          {phase.kind === 'menu' && (
            <Menu
              onBegin={startNewReading}
              onOpenResume={() => setPhase({ kind: 'resume' })}
              onSettings={() => setPhase({ kind: 'settings' })}
            />
          )}

          {phase.kind === 'resume' && (
            <ResumeMenu
              onResume={(s) => resumeSession(s)}
              onBack={goMenu}
            />
          )}

          {phase.kind === 'settings' && <Settings onBack={goMenu} />}

          {phase.kind === 'survey' && apiKey && (
            <SurveyScreen
              apiKey={apiKey}
              session={phase.session}
              onComplete={(brief) => onSurveyComplete(phase.session, brief)}
            />
          )}

          {phase.kind === 'reading' && apiKey && (
            <Reading
              apiKey={apiKey}
              brief={phase.brief}
              onExit={goMenu}
            />
          )}
        </main>
    </div>
  );
}
