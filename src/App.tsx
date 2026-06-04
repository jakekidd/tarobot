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
import { Antechamber as AntechamberScreen } from './ui/Antechamber';
import { Reading } from './ui/Reading';
import { Pipeline } from './ui/Pipeline';
import { Bench } from './lab/Bench';
import { IntroductionSurveyScreen } from './ui/survey/IntroductionSurveyScreen';
import { SurveyDone } from './ui/survey/SurveyDone';
import { IntroductionSurvey, loadSurvey, type RawPortrait } from './pipeline/introduction-survey';
import { TarobotScene } from './ui/scene/TarobotScene';
import { buildMarisolDemoSeer } from './pipeline/seer';
import { AnthropicAdapter } from './pipeline/antechamber';
import { createClaudeClient } from './pipeline/claude';
import './ui/pipeline.css';
import { Debug } from './debug/Debug';
import { DebugInspector } from './debug/DebugInspector';
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
  | { kind: 'antechamber'; session: Session; loadedPerson?: Person | null }
  | { kind: 'reading'; session: Session; seer: Seer }
  | { kind: 'pipeline' }
  | { kind: 'bench' }
  | { kind: 'survey'; survey: IntroductionSurvey }
  | { kind: 'survey_done'; raw: RawPortrait };

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
    // Bailing out of the antechamber via the topbar leaves the durable Person
    // record (created at save threshold) but clears the volatile active
    // session — we don't have a "resume in-progress antechamber" feature, and
    // letting it linger would mean stale engine state in storage.
    if (phase.kind === 'antechamber') clearActiveSession();
    setPhase({ kind: 'menu' });
  }

  /** Skip the antechamber: hydrate from a saved Person and go straight to
   *  the intention prompt. Person record is NOT touched (immutable). */
  function startLoadedReading(person: Person) {
    const s = newSession();
    setPhase({ kind: 'antechamber', session: s, loadedPerson: person });
  }

  function startNewReading() {
    // New visit → the IntroductionSurvey (deterministic, no AI). It drives
    // the UI rails and, on completion, hands up a RawPortrait. This pass
    // dumps that to the SurveyDone page — the TuningEngine that would consume
    // it is not wired yet, so the flow intentionally ends there.
    setPhase({ kind: 'survey', survey: new IntroductionSurvey(loadSurvey()) });
  }

  // Brief "we're leaving the menu" flag — set when READ DEMO fires so
  // the menu fades out its buttons + dialogue while the turtle
  // disintegrates. Cleared when Reading mounts (or on cancellation).
  const [menuTransitioning, setMenuTransitioning] = useState(false);

  /** Skip the antechamber: synthesize a session and route straight into the
   *  reading with a hand-authored brief and intro. Triggers the same
   *  mascot disintegration as the antechamber path so the turtle is gone
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

  function onAntechamberComplete(session: Session, seer: Seer) {
    // Antechamber close: clear the active session and route to the reading.
    // The Person record was upserted during the antechamber (at save threshold
    // and on each subsequent save), so identity persists across visits.
    clearActiveSession();
    setPhase({ kind: 'reading', session, seer });
  }

  // Bench is its own world — no CRT filter, no Three.js scene, no
  // main-app topbar. The lab/ subtree owns its entire visual surface.
  const inBench = phase.kind === 'bench';

  return (
    <div className="app">
      {!inBench && (
        <>
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
        </>
      )}

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
              onBench={() => setPhase({ kind: 'bench' })}
              transitioning={menuTransitioning}
            />
          )}

          {phase.kind === 'resume' && (
            <ResumeMenu onBack={goMenu} onLoad={startLoadedReading} />
          )}

          {phase.kind === 'settings' && <Settings onBack={goMenu} />}

          {phase.kind === 'antechamber' && apiKey && (
            <AntechamberScreen
              apiKey={apiKey}
              session={phase.session}
              loadedPerson={phase.loadedPerson}
              onComplete={(seer) => onAntechamberComplete(phase.session, seer)}
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

          {phase.kind === 'bench' && apiKey && (
            <Bench apiKey={apiKey} onExit={goMenu} />
          )}

          {phase.kind === 'survey' && (
            <IntroductionSurveyScreen
              driver={phase.survey}
              onDone={(raw) => setPhase({ kind: 'survey_done', raw })}
            />
          )}

          {phase.kind === 'survey_done' && (
            <SurveyDone raw={phase.raw} onExit={goMenu} />
          )}
        </main>

      <Debug visible={debugVisible} />
      <DebugInspector visible={debugVisible && phase.kind === 'antechamber'} />
      {/* Live agent activity stream — debug-only. Toggled via the debug
          chip in the topbar so it doesn't crowd the actual UI during
          normal use. */}
      {debugVisible && <AgentActivity />}
    </div>
  );
}
