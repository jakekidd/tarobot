import { useEffect, useState } from 'react';
import { Seer } from './pipeline/seer';
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
import { XrayLab } from './lab/xray/XrayLab';
import { BoothDemo } from './ui/booth/BoothDemo';
import { IntroductionSurveyScreen } from './ui/survey/IntroductionSurveyScreen';
import { SurveyDone } from './ui/survey/SurveyDone';
import { TuningScreen } from './ui/tuning/TuningScreen';
import { TuningLoading } from './ui/tuning/TuningLoading';
import { TuningDone } from './ui/tuning/TuningDone';
import { CompilingScreen } from './ui/tuning/CompilingScreen';
import { IntroductionSurvey, loadSurvey, type RawPortrait } from './pipeline/introduction-survey';
import {
  TuningEngine,
  draftPortrait,
  enrichWriteIn,
  type AntechamberOutput,
  type ConjectorResult,
  type WriteInEnrichment,
} from './pipeline/tuning';
import { compile } from './pipeline/compiler';
import type { LLMAdapter } from './pipeline/llm/adapter';
import type { RailDriver } from './pipeline/rails/types';
import { TarobotScene } from './ui/scene/TarobotScene';
import { buildMarisolDemoSeer } from './pipeline/seer';
import { AnthropicAdapter } from './pipeline/antechamber';
import { createClaudeClient } from './pipeline/claude';
import './ui/pipeline.css';
import { Debug } from './debug/Debug';
import { DebugInspector } from './debug/DebugInspector';
import { recordUsage } from './debug/usageTally';
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
  | { kind: 'xray' }
  | { kind: 'booth' }
  | { kind: 'survey'; survey: IntroductionSurvey }
  | { kind: 'survey_done'; raw: RawPortrait }
  | { kind: 'tuning_loading' }
  | { kind: 'tuning'; driver: RailDriver<ConjectorResult>; engine: TuningEngine }
  | { kind: 'tuning_done'; output: AntechamberOutput }
  | { kind: 'compiling' };

export function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => loadApiKey());
  // the xray lab is the front door for now: the ensemble is the
  // go-forward bet and the turtle app is parked. the menu (and the whole
  // turtle world) stays reachable via the lab's ← menu button.
  const [phase, setPhase] = useState<Phase>(() =>
    loadApiKey() ? { kind: 'xray' } : { kind: 'key' },
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
    // the UI rails and, on completion, hands up a RawPortrait that feeds the
    // TuningEngine (the Conjector hunts dilemmas off it).
    setPhase({ kind: 'survey', survey: new IntroductionSurvey(loadSurvey()) });
  }

  async function enterTuning(raw: RawPortrait) {
    // Survey done → run the Scribe over any write-ins, then the Condenser to
    // paint the Portrait, then hand the Conjector to the rails. Condenser +
    // Conjector call the model, so a key is required; with none we just dump.
    if (!apiKey) {
      setPhase({ kind: 'survey_done', raw });
      return;
    }
    const adapter = new AnthropicAdapter(createClaudeClient(apiKey), recordUsage);
    setPhase({ kind: 'tuning_loading' });
    // Scribe: enrich free-text answers into real channels (parallel), join
    // before the Condenser. A failed enrichment rides through unenriched.
    const enrichments = await enrichWriteIns(adapter, raw);
    const engine = new TuningEngine(adapter, raw, enrichments);
    try {
      const portrait = await engine.paintPortrait();
      setPhase({ kind: 'tuning', driver: engine.begin(portrait), engine });
    } catch {
      // Condenser failed → fall back to the raw-amalgam draft so the hunt
      // still runs rather than dead-ending on a bad model call.
      setPhase({ kind: 'tuning', driver: engine.begin(draftPortrait(raw)), engine });
    }
  }

  async function enrichWriteIns(
    adapter: LLMAdapter,
    raw: RawPortrait,
  ): Promise<Map<string, WriteInEnrichment>> {
    const writeIns = raw.facets.filter((f) => f.free_text);
    if (writeIns.length === 0) return new Map();
    const bySlug = new Map(loadSurvey().facets.map((f) => [f.slug, f]));
    const entries = await Promise.all(
      writeIns.map(async (f) => {
        const facet = bySlug.get(f.slug);
        if (!facet) return null;
        try {
          return [f.slug, await enrichWriteIn(adapter, facet, f.chosen)] as const;
        } catch {
          return null; // a failed enrichment just rides through unenriched
        }
      }),
    );
    return new Map(entries.filter((e): e is [string, WriteInEnrichment] => e !== null));
  }

  /** The Compiler stage — the clean cut between antechamber and reading.
   *  AntechamberOutput in → CompiledBrief out → Seer constructed from the
   *  brief alone. On failure we land back on the dump screen so nothing
   *  is lost. */
  async function enterReading(output: AntechamberOutput) {
    if (!apiKey) return;
    const adapter = new AnthropicAdapter(createClaudeClient(apiKey), recordUsage);
    setPhase({ kind: 'compiling' });
    try {
      const brief = await compile(adapter, output);
      publishDebug(
        'compiler.brief',
        `${brief.prose_brief.length} chars · ${brief.drawn.cards.map((c) => c.card.name).join(' · ')}`,
      );
      const seer = new Seer({
        adapter,
        profile: brief.profile,
        antechamberHistory: [],
        intention: brief.intention,
        drawn: brief.drawn,
        outcomes: brief.outcomes,
        prose_brief: brief.prose_brief,
      });
      const s: Session = { ...newSession(), phase: 'tent' };
      const unsub = subscribeMascotDisintegrateComplete(() => {
        unsub();
        setPhase({ kind: 'reading', session: s, seer });
      });
      triggerMascotDisintegrate();
    } catch (e) {
      console.error('[compiler] failed; returning to the dump', e);
      setPhase({ kind: 'tuning_done', output });
    }
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
      const adapter = new AnthropicAdapter(createClaudeClient(apiKey), recordUsage);
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

  // Bench and the xray lab are their own worlds — no CRT filter, no
  // Three.js scene, no main-app topbar. The lab/ subtree owns its
  // entire visual surface.
  const inLab = phase.kind === 'bench' || phase.kind === 'xray' || phase.kind === 'booth';

  return (
    <div className="app">
      {!inLab && (
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
            <KeyEntry onValidated={(k) => { setApiKey(k); setPhase({ kind: 'xray' }); }} />
          )}

          {phase.kind === 'menu' && (
            <Menu
              onBegin={startNewReading}
              onReadDemo={startReadDemo}
              onOpenResume={() => setPhase({ kind: 'resume' })}
              onSettings={() => setPhase({ kind: 'settings' })}
              onBench={() => setPhase({ kind: 'bench' })}
              onXray={() => setPhase({ kind: 'xray' })}
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

          {phase.kind === 'xray' && apiKey && (
            <XrayLab apiKey={apiKey} onExit={goMenu} onBooth={() => setPhase({ kind: 'booth' })} />
          )}

          {phase.kind === 'booth' && apiKey && (
            <BoothDemo apiKey={apiKey} onExit={() => setPhase({ kind: 'xray' })} />
          )}

          {phase.kind === 'survey' && (
            <IntroductionSurveyScreen driver={phase.survey} onDone={enterTuning} />
          )}

          {phase.kind === 'survey_done' && (
            <SurveyDone raw={phase.raw} onExit={goMenu} />
          )}

          {phase.kind === 'tuning_loading' && <TuningLoading />}

          {phase.kind === 'tuning' && (
            <TuningScreen
              driver={phase.driver}
              onDone={(result) =>
                setPhase({ kind: 'tuning_done', output: phase.engine.assemble(result) })
              }
            />
          )}

          {phase.kind === 'tuning_done' && (
            <TuningDone
              output={phase.output}
              onContinue={() => void enterReading(phase.output)}
              onExit={goMenu}
            />
          )}

          {phase.kind === 'compiling' && <CompilingScreen />}
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
