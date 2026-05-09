import { useEffect, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { chime } from './sound/sound';
import {
  loadActive,
  loadArchive,
  clearAll,
  type Session,
} from '../storage';

type Props = {
  onBegin: () => void;
  onResume: (session: Session) => void;
  onViewPast: () => void;
};

const GREETING = 'come in. tell me you want to know.';

export function Menu({ onBegin, onResume, onViewPast }: Props) {
  const [active] = useState<Session | null>(() => loadActive());
  const [archiveCount] = useState<number>(() => loadArchive().length);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    chime();
  }, []);

  return (
    <div className="screen screen--menu">
      <div className="menu__stage">
        <Reader isSpeaking={speaking} />
        <Dialogue
          text={GREETING}
          onTypingChange={setSpeaking}
        />
      </div>

      <div className="menu__choices">
        {active && (
          <button
            className="btn btn--primary"
            onClick={() => onResume(active)}
          >
            resume reading in progress
          </button>
        )}
        <button className="btn btn--primary" onClick={onBegin}>
          {active ? 'begin a new reading' : 'begin a reading'}
        </button>
        {archiveCount > 0 && (
          <button className="btn btn--ghost" onClick={onViewPast}>
            past readings ({archiveCount})
          </button>
        )}
        <button
          className="btn btn--quiet"
          onClick={() => {
            if (confirm('clear all stored data including your api key?')) {
              clearAll();
              window.location.reload();
            }
          }}
        >
          clear all data
        </button>
      </div>
    </div>
  );
}
