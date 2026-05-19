import { useEffect, useMemo, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { chime } from './sound/sound';
import { listPeople } from '../storage';

type Props = {
  onBegin: () => void;
  onReadDemo: () => void;
  onOpenResume: () => void;
  onSettings: () => void;
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

export function Menu({ onBegin, onReadDemo, onOpenResume, onSettings }: Props) {
  const [resumeCount] = useState(() => listPeople().length);
  const [speaking, setSpeaking] = useState(false);

  // Phased visibility — drives CSS classes that gate the entrance.
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [dialogueTyping, setDialogueTyping] = useState(false);
  const [visibleButtons, setVisibleButtons] = useState(0);

  // Stable list of buttons so the index → delay mapping is deterministic.
  // RESUME is always rendered now; it's disabled when there are no prior
  // profiles (rather than hidden) so the cascade timing is constant
  // regardless of whether the user has any saved sessions.
  const buttons = useMemo(() => {
    const noResume = resumeCount === 0;
    return [
      { key: 'begin',    label: 'BEGIN',     cls: 'btn btn--primary btn--menu', onClick: onBegin,      disabledByState: false },
      { key: 'resume',   label: 'RESUME',    cls: 'btn btn--primary btn--menu', onClick: onOpenResume, disabledByState: noResume },
      { key: 'demo',     label: 'READ DEMO', cls: 'btn btn--ghost btn--menu',   onClick: onReadDemo,   disabledByState: false },
      { key: 'settings', label: 'SETTINGS',  cls: 'btn btn--ghost btn--menu',   onClick: onSettings,   disabledByState: false },
    ];
  }, [resumeCount, onBegin, onOpenResume, onReadDemo, onSettings]);

  useEffect(() => { chime(); }, []);

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
    <div className="screen screen--menu">
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
        by continuing, you consent to sharing anonymous usage data with the
        development team to improve the experience.
      </p>
    </div>
  );
}
