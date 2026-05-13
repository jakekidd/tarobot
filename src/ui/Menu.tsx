import { useEffect, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { chime } from './sound/sound';
import {
  loadActive,
  clearAllExceptKey,
  clearApiKey,
  type Session,
} from '../storage';

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
        {active && (
          <button className="btn btn--primary" onClick={() => onResume(active)}>
            resume reading in progress
          </button>
        )}
        <button className="btn btn--primary" onClick={onBegin}>
          {active ? 'begin a new reading' : 'begin a reading'}
        </button>
        <button className="btn btn--ghost" onClick={onSettings}>
          settings
        </button>
        <div className="menu__quiet-row">
          <button
            className="btn btn--quiet"
            onClick={() => {
              if (confirm('clear all sessions, archive, and settings? api key stays.')) {
                clearAllExceptKey();
                window.location.reload();
              }
            }}
          >
            clear all data
          </button>
          <button
            className="btn btn--quiet"
            onClick={() => {
              if (confirm('reset the stored api key? you\'ll be asked for a new one.')) {
                clearApiKey();
                window.location.reload();
              }
            }}
          >
            reset api key
          </button>
        </div>
      </div>
    </div>
  );
}
