import { useEffect, useMemo, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { chime } from './sound/sound';
import { useAmbientTrack } from './sound/useAmbientTrack';
import { listPeople } from '../storage';

type Props = {
  onBegin: () => void;
  onReadDemo: () => void;
  onOpenResume: () => void;
  onSettings: () => void;
  /** Open the Bench — dev/inspection app for the pipeline. Lives in
   *  src/lab/. Designer can vibe-code src/ui/ safely without touching
   *  it; logic iteration happens there. */
  onBench: () => void;
  /** Open the xray lab — the ensemble reading engine's debug surface
   *  (ENSEMBLE-PLAN.md). Own world like Bench. */
  onXray: () => void;
  /** True once a transition out of the menu has started (e.g. READ DEMO
   *  fired, turtle is mid-disintegrate). UI fades out so the visual
   *  focus is on the turtle dissolving, not on the buttons we're
   *  leaving behind. */
  transitioning?: boolean;
};

// New greeting — keep it lowercase to match the rest of the UI register.
const GREETING =
  'welcome, traveler. tell me, what questions do you have for the great beyond?';

// Menu entry timeline (ms from mount). Aligned with the turtle's own
// warp-in (delay 600ms + warp 900ms = arrived at 1500ms). Dialogue and
// buttons start cascading right after.
const T_DIALOGUE_OPEN_MS = 1600;   // dialogue stage starts expanding (line → full width)
const T_DIALOGUE_TYPE_MS = 1900;   // typewriter begins after the line has expanded
const T_BUTTON_BASE_MS   = 2400;   // first button appears
const T_BUTTON_STEP_MS   = 220;    // gap between successive buttons

export function Menu({ onBegin, onReadDemo, onOpenResume, onSettings, onBench, onXray, transitioning }: Props) {
  const [resumeCount] = useState(() => listPeople().length);
  const [speaking, setSpeaking] = useState(false);

  // Phased visibility — drives CSS classes that gate the entrance.
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [dialogueTyping, setDialogueTyping] = useState(false);
  const [visibleButtons, setVisibleButtons] = useState(0);

  // Stable list of buttons so the index → delay mapping is deterministic.
  // RESUME is always rendered and always enabled — even with zero prior
  // profiles, the ResumeMenu hosts the LOAD DEMO entrypoint, so the
  // button must remain clickable on a fresh install.
  const buttons = useMemo(() => {
    void resumeCount; // kept in deps for future "0 visits" tinting
    return [
      { key: 'begin',    label: 'BEGIN',     cls: 'btn btn--primary btn--menu', onClick: onBegin,      disabledByState: false },
      { key: 'resume',   label: 'RESUME',    cls: 'btn btn--primary btn--menu', onClick: onOpenResume, disabledByState: false },
      { key: 'demo',     label: 'READ DEMO', cls: 'btn btn--ghost btn--menu',   onClick: onReadDemo,   disabledByState: false },
      { key: 'xray',     label: 'XRAY LAB',  cls: 'btn btn--ghost btn--menu',   onClick: onXray,       disabledByState: false },
      { key: 'bench',    label: 'BENCH',     cls: 'btn btn--ghost btn--menu',   onClick: onBench,      disabledByState: false },
      { key: 'settings', label: 'SETTINGS',  cls: 'btn btn--ghost btn--menu',   onClick: onSettings,   disabledByState: false },
    ];
  }, [resumeCount, onBegin, onOpenResume, onReadDemo, onXray, onBench, onSettings]);

  useEffect(() => { chime(); }, []);

  // Ambient bed for the menu: kalimba, mixed quiet enough to sit well
  // under the greeting dialogue without competing.
  useAmbientTrack('/audio/kalimba-distant.mp3', 0.11);

  // Schedule the cascade. Each timer just flips a flag; CSS handles the
  // actual visual expand/fade. Cancelled on unmount.
  useEffect(() => {
    const handles: number[] = [];
    handles.push(window.setTimeout(() => setDialogueOpen(true), T_DIALOGUE_OPEN_MS));
    handles.push(window.setTimeout(() => setDialogueTyping(true), T_DIALOGUE_TYPE_MS));
    for (let i = 0; i < buttons.length; i++) {
      const delay = T_BUTTON_BASE_MS + i * T_BUTTON_STEP_MS;
      handles.push(window.setTimeout(() => setVisibleButtons((n) => Math.max(n, i + 1)), delay));
    }
    return () => { for (const h of handles) window.clearTimeout(h); };
  }, [buttons.length]);

  return (
    <div className={`screen screen--menu ${transitioning ? 'screen--menu--exiting' : ''}`}>
      <div className="menu__stage">
        <Reader isSpeaking={speaking} />
        <div className={`menu__dialogue-wrap ${dialogueOpen ? 'is-open' : ''}`}>
          {dialogueTyping ? (
            <Dialogue text={GREETING} onTypingChange={setSpeaking} />
          ) : (
            // Placeholder during the line-expand phase: same outer frame
            // so the dialogue stage doesn't jump when the typewriter takes over.
            <div className="dialogue-stage dialogue-stage--placeholder" aria-hidden />
          )}
        </div>
      </div>

      <div className="menu__choices">
        {buttons.map((b, i) => {
          const cascaded = i < visibleButtons;
          return (
            <button
              key={b.key}
              className={`${b.cls} menu__btn ${cascaded ? 'is-visible' : ''}`}
              onClick={b.onClick}
              // Disabled if either: still cascading in OR no underlying state (e.g. no resume profiles).
              disabled={!cascaded || b.disabledByState}
              tabIndex={cascaded ? 0 : -1}
            >
              {b.label}
            </button>
          );
        })}
      </div>

      <p className="menu__consent">
        this experience is ai-assisted. your answers live in this browser and
        go only to the model, with your key.
      </p>
    </div>
  );
}
