import { useEffect, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { chime } from './sound/sound';
import { loadActive, type Session } from '../storage';

type Props = {
  onBegin: () => void;
  onResume: (session: Session) => void;
  onSettings: () => void;
};

const GREETING = 'come in. tell me you want to know.';

export function Menu({ onBegin, onResume, onSettings }: Props) {
  const [active] = useState<Session | null>(() => loadActive());
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => { chime(); }, []);

  return (
    <div className="screen screen--menu">
      <div className="menu__stage">
        <Reader isSpeaking={speaking} />
        <Dialogue text={GREETING} onTypingChange={setSpeaking} />
      </div>

      <div className="menu__choices">
        <button className="btn btn--primary" onClick={onBegin}>
          begin
        </button>
        {active && (
          <button className="btn btn--primary" onClick={() => onResume(active)}>
            resume
          </button>
        )}
        <button className="btn btn--ghost" onClick={onSettings}>
          settings
        </button>
      </div>
    </div>
  );
}
