import { useEffect, useState } from 'react';
import type { Seer } from './pipeline/seer';
import {
  loadApiKey,
  newSession,
  clearActiveSession,
  type Person,
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
import { buildMarisolDemoSeer } from './pipeline/seer';
import { AnthropicAdapter } from './pipeline/survey';
import { createClaudeClient } from './pipeline/claude';
import './ui/pipeline.css';
import { Debug } from './debug/Debug';
import { ProfilerWorkspace } from './debug/ProfilerWorkspace';
import { HypothesisView } from './debug/HypothesisView';
import { AnchorView } from './debug/AnchorView';
import { loadDebugVisible, saveDebugVisible } from './debug/visibilityStorage';
import { publishDebug } from './debug/debugBus';
import './debug/debug.css';
import { AudioWakeBadge } from './ui/sound/AudioWakeBadge';
import {
  subscribeMascotDisintegrateComplete,
  triggerMascotDisintegrate,
} from './ui/scene/disintegrateStore';
import { AgentActivity } from './debug/AgentActivity';

type Phase =
  | { kind: 'key' }
  | { kind: 'menu' }
  | { kind: 'resume' }
  | { kind: 'settings' }
  | { kind: 'survey'; session: Session; loadedPerson?: Person | null }
  | { kind: 'reading'; session: Session; seer: Seer }
  | { kind: 'pipeline' };

export function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => loadApiKey());
  const [phase, setPhase] = useState<Phase>(() =>
    loadApiKey() ? { kind: 'menu' } : { kind: 'key' },
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
    // Bailing out of a survey via the topbar leaves the durable Person
    // record (created at save threshold) but clears the volatile active
    // session — we don't have a "resume in-progress survey" feature, and
    // letting it linger would mean stale engine state in storage.
    if (phase.kind === 'survey') clearActiveSession();
    setPhase({ kind: 'menu' });
  }

  /** Skip the survey: hydrate from a saved Person and go straight to
   *  the intention prompt. Person record is NOT touched (immutable). */
  function startLoadedReading(person: Person) {
    const s = newSession();
    setPhase({ kind: 'survey', session: s, loadedPerson: person });
  }

  function startNewReading() {
    // New visit. In-memory only until save threshold lands inside Survey.
    const s = newSession();
    setPhase({ kind: 'survey', session: s });
  }

  // Brief "we're leaving the menu" flag — set when READ DEMO fires so
  // the menu fades out its buttons + dialogue while the turtle
  // disintegrates. Cleared when Reading mounts (or on cancellation).
  const [menuTransitioning, setMenuTransitioning] = useState(false);

  /** Skip survey: synthesize a session and route straight into the
   *  reading with a hand-authored brief and intro. Triggers the same
   *  mascot disintegration as the survey path so the turtle is gone
   *  by the time the reading fly-in starts. No goodbye dialogue — the
   *  read demo is dev/showcase only, not a full booth experience. */
  function startReadDemo() {
    if (!apiKey) return;
    setMenuTransitioning(true);
    const unsub = subscribeMascotDisintegrateComplete(() => {
      unsub();
      const s: Session = { ...newSession(), phase: 'tent' };
      const adapter = new AnthropicAdapter(createClaudeClient(apiKey));
      setPhase({
        kind: 'reading',
        session: s,
        seer: buildMarisolDemoSeer(adapter),
      });
      setMenuTransitioning(false);
    });
    triggerMascotDisintegrate();
  }

  function onSurveyComplete(session: Session, seer: Seer) {
    // Survey close: clear the active session and route to the reading.
    // The Person record was upserted during the survey (at save threshold
    // and on each subsequent save), so identity persists across visits.
    clearActiveSession();
    setPhase({ kind: 'reading', session, seer });
  }

  return (
    <div className="app">
      {/* Full-screen Three.js scene — renders the cat wherever a ReaderAnchor is mounted */}
      <TarobotScene />

      <header className="app__topbar">
        <div className="app__brand-block">
          <span className="app__brand">tarobot</span>
          <span className="app__version">v0.0.2-{__APP_COMMIT__}</span>
          <button
            type="button"
            className={`debug-chip ${debugVisible ? 'debug-chip--on' : ''}`}
            onClick={toggleDebug}
            title="toggle debug overlay"
          >
            debug
          </button>
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
          <AudioWakeBadge />
          {phase.kind !== 'menu' && phase.kind !== 'key' && phase.kind !== 'pipeline' && (
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
              transitioning={menuTransitioning}
            />
          )}

          {phase.kind === 'resume' && (
            <ResumeMenu onBack={goMenu} onLoad={startLoadedReading} />
          )}

          {phase.kind === 'settings' && <Settings onBack={goMenu} />}

          {phase.kind === 'survey' && apiKey && (
            <SurveyScreen
              apiKey={apiKey}
              session={phase.session}
              loadedPerson={phase.loadedPerson}
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

          {phase.kind === 'pipeline' && <Pipeline onBack={goMenu} />}
        </main>

      <Debug visible={debugVisible} />
      {/* v3.2 left column: profiler workspace (top) + live hypothesis
          list (middle, where the action is during survey) + anchor
          view (bottom, populated only at close by the compiler).
          Survey-phase-only. */}
      {debugVisible && phase.kind === 'survey' && (
        <div className="debug-left-column">
          <ProfilerWorkspace visible={true} />
          <HypothesisView visible={true} />
          <AnchorView visible={true} />
        </div>
      )}
      {/* Live agent activity stream — debug-only. Toggled via the debug
          chip in the topbar so it doesn't crowd the actual UI during
          normal use. */}
      {debugVisible && <AgentActivity />}
    </div>
  );
}
