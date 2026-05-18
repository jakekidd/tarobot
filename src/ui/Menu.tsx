import { useEffect, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { chime } from './sound/sound';
import { listPeople, loadActiveSession } from '../storage';

type Props = {
  onBegin: () => void;
  onReadDemo: () => void;
  onOpenResume: () => void;
  onSettings: () => void;
};

const GREETING = 'come in. tell me you want to know.';

export function Menu({ onBegin, onReadDemo, onOpenResume, onSettings }: Props) {
  const [resumeCount] = useState(
    () => (loadActiveSession() ? 1 : 0) + listPeople().length,
  );
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => { chime(); }, []);

  return (
    <div className="screen screen--menu">
      <div className="menu__stage">
        <Reader isSpeaking={speaking} />
        <Dialogue text={GREETING} onTypingChange={setSpeaking} />
      </div>

      <div className="menu__choices">
        <button className="btn btn--primary btn--menu" onClick={onBegin}>
          BEGIN
        </button>
        {resumeCount > 0 && (
          <button className="btn btn--primary btn--menu" onClick={onOpenResume}>
            RESUME
          </button>
        )}
        <button className="btn btn--ghost btn--menu" onClick={onReadDemo}>
          READ DEMO
        </button>
        <button className="btn btn--ghost btn--menu" onClick={onSettings}>
          SETTINGS
        </button>
      </div>

      <p className="menu__consent">
        by continuing, you consent to sharing anonymous usage data with the
        development team to improve the experience.
      </p>
    </div>
  );
}
