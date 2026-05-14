import { useState } from 'react';
import type { Profile, Question, Survey } from './pipeline';
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
import { EnterTent } from './ui/EnterTent';
import { Tent } from './ui/Tent';
import { TarobotScene } from './ui/scene/TarobotScene';

type Phase =
  | { kind: 'key' }
  | { kind: 'menu' }
  | { kind: 'resume' }
  | { kind: 'settings' }
  | { kind: 'survey'; session: Session }
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
      case 'enter-tent':
        if (!s.survey || !s.profile || !s.openers) { startNewReading(); return; }
        setPhase({
          kind: 'enter-tent', session: s, survey: s.survey,
          profile: s.profile, openers: s.openers,
        });
        return;
      case 'tent':
        if (!s.survey || !s.profile || !s.openers) { startNewReading(); return; }
        setPhase({
          kind: 'tent', session: s, survey: s.survey,
          profile: s.profile, openers: s.openers,
        });
        return;
      default:
        goMenu();
    }
  }

  function onSurveyComplete(session: Session, brief: CompilerOutput) {
    const surveyShim: Survey = {
      answers: [],
      started_at: session.started_at,
      ended_at: Date.now(),
    };
    const next: Session = {
      ...session,
      phase: 'enter-tent',
      survey: surveyShim,
      profile: brief.profile,
      openers: brief.openers,
    };
    saveSession(next);
    setPhase({
      kind: 'enter-tent',
      session: next,
      survey: surveyShim,
      profile: brief.profile,
      openers: brief.openers,
    });
  }

  function onEnter(session: Session, survey: Survey, profile: Profile, openers: Question[]) {
    const next: Session = { ...session, phase: 'tent' };
    saveSession(next);
    setPhase({ kind: 'tent', session: next, survey, profile, openers });
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

      <main className={`app__main ${phase.kind === 'tent' ? 'app__main--full' : ''}`}>
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
              debugOpen={debugOpen}
              onCloseDebug={() => setDebugOpen(false)}
            />
          )}
        </main>
    </div>
  );
}
