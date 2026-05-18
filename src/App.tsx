import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Seer } from './pipeline/seer';
import { isUsingTreeOverride, subscribeToOverrideChanges } from './pipeline/survey';
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
import { Pipeline } from './ui/Pipeline';
import { TarobotScene } from './ui/scene/TarobotScene';
import { buildMarisolDemoSeer, MARISOL_INTRO } from './pipeline/seer';
import { AnthropicAdapter } from './pipeline/survey';
import { createClaudeClient } from './pipeline/claude';
import { Jade } from './jade/Jade';
import { useSecretSequence } from './jade/useSecretSequence';
import './jade/jade.css';
import './ui/pipeline.css';
import { Debug } from './debug/Debug';
import { DebugQueue } from './debug/DebugQueue';
import { loadDebugVisible, saveDebugVisible } from './debug/visibilityStorage';
import { publishDebug } from './debug/debugBus';
import './debug/debug.css';

type Phase =
  | { kind: 'key' }
  | { kind: 'menu' }
  | { kind: 'resume' }
  | { kind: 'settings' }
  | { kind: 'survey'; session: Session }
  | { kind: 'reading'; session: Session; seer: Seer; preferredIntro?: typeof MARISOL_INTRO }
  | { kind: 'jade' }
  | { kind: 'pipeline' };

export function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => loadApiKey());
  const [phase, setPhase] = useState<Phase>(() =>
    loadApiKey() ? { kind: 'menu' } : { kind: 'key' },
  );
  const { unlocked: jadeUnlocked } = useSecretSequence();
  // Live-track whether the survey is using Jade's local override, so the
  // navbar asterisk reacts the moment edits land.
  const overrideActive = useSyncExternalStore(
    subscribeToOverrideChanges,
    isUsingTreeOverride,
    isUsingTreeOverride,
  );

  // Debug overlay toggle — persists between sessions.
  const [debugVisible, setDebugVisible] = useState<boolean>(() => loadDebugVisible());
  function toggleDebug() {
    const next = !debugVisible;
    saveDebugVisible(next);
    setDebugVisible(next);
  }

  // Publish app-level phase so the debug overlay can show where the user is.
  useEffect(() => {
    publishDebug('app.phase', phase.kind);
  }, [phase.kind]);

  function goMenu() {
    setPhase({ kind: 'menu' });
  }

  function startNewReading() {
    const s = newSession();
    saveSession(s);
    setPhase({ kind: 'survey', session: s });
  }

  /** Skip survey: synthesize a session and route straight into the
   *  reading with a hand-authored brief and intro. */
  function startReadDemo() {
    if (!apiKey) return;
    const s: Session = { ...newSession(), phase: 'tent' };
    saveSession(s);
    const adapter = new AnthropicAdapter(createClaudeClient(apiKey));
    setPhase({
      kind: 'reading',
      session: s,
      seer: buildMarisolDemoSeer(adapter),
      preferredIntro: MARISOL_INTRO,
    });
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

  function onSurveyComplete(session: Session, seer: Seer) {
    // Persist a profile snapshot — Seer holds the live read but the
    // session row still wants a Profile for resume UI.
    const next: Session = {
      ...session,
      phase: 'tent',
      profile: seer.getProfile(),
    };
    saveSession(next);
    setPhase({ kind: 'reading', session: next, seer });
  }

  return (
    <div className="app">
      {/* Full-screen Three.js scene — renders Clat wherever a ReaderAnchor is mounted */}
      <TarobotScene />

      <header className="app__topbar">
        <div className="app__brand-block">
          <span className="app__brand">tarobot</span>
          {overrideActive && (
            <span
              className="jade-override-asterisk"
              title="survey is using your local jade edits, not the bundled tree"
              aria-label="using local survey override"
            >*</span>
          )}
          <span className="app__version">v0.0.2-{__APP_COMMIT__}</span>
          <button
            type="button"
            className={`debug-chip ${debugVisible ? 'debug-chip--on' : ''}`}
            onClick={toggleDebug}
            title="toggle debug overlay"
          >
            debug
          </button>
          {jadeUnlocked && phase.kind !== 'jade' && (
            <button
              type="button"
              className="jade-unlock-chip"
              onClick={() => setPhase({ kind: 'jade' })}
              title="open jade — survey tree editor"
            >
              jade
            </button>
          )}
          {phase.kind !== 'pipeline' && (
            <button
              type="button"
              className="pipeline-chip"
              onClick={() => setPhase({ kind: 'pipeline' })}
              title="open pipeline — live audit of all agents + prompts"
            >
              pipeline
            </button>
          )}
        </div>
        <div className="app__topbar-actions">
          {phase.kind !== 'menu' && phase.kind !== 'key' && phase.kind !== 'jade' && phase.kind !== 'pipeline' && (
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
              onReadDemo={startReadDemo}
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
              onComplete={(seer) => onSurveyComplete(phase.session, seer)}
            />
          )}

          {phase.kind === 'reading' && apiKey && (
            <Reading
              apiKey={apiKey}
              seer={phase.seer}
              onExit={goMenu}
            />
          )}

          {phase.kind === 'jade' && <Jade onExit={goMenu} />}

          {phase.kind === 'pipeline' && <Pipeline onBack={goMenu} />}
        </main>

      <Debug visible={debugVisible} />
      <DebugQueue visible={debugVisible && phase.kind === 'survey'} />
    </div>
  );
}
