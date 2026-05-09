import { useState } from 'react';
import { loadArchive, type Session } from '../storage';

type Props = {
  onBack: () => void;
};

export function PastReadings({ onBack }: Props) {
  const [archive] = useState<Session[]>(() => loadArchive());

  return (
    <div className="screen screen--past">
      <header className="screen__head">
        <h2 className="screen__title">past readings</h2>
        <button className="btn btn--ghost" onClick={onBack}>back</button>
      </header>

      {archive.length === 0 ? (
        <p className="screen__lede">nothing yet.</p>
      ) : (
        <ul className="past-list">
          {archive.map((s) => (
            <li key={s.id} className="past-item">
              <div className="past-item__head">
                <span>{s.profile?.name ?? '—'}</span>
                <span className="past-item__date">
                  {new Date(s.completed_at ?? s.started_at).toLocaleString()}
                </span>
              </div>
              <div className="past-item__theme">
                {s.reading?.theme ?? '(incomplete)'}
              </div>
              {s.reading && (
                <details className="past-item__details">
                  <summary>read it again</summary>
                  <div className="past-item__arc">{s.reading.arc}</div>
                  {s.reading.chapters.map((c) => (
                    <div key={c.position_id} className="past-item__chapter">
                      <strong>{c.position_id}</strong>
                      <p>{c.spoken_text}</p>
                    </div>
                  ))}
                  <p className="past-item__closing">{s.reading.closing_text}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
