import { useState } from 'react';
import {
  deleteSession,
  listResumable,
  type Session,
} from '../storage';

type Props = {
  onResume: (session: Session) => void;
  onBack: () => void;
};

/**
 * Lists resumable sessions (in-progress). Each row shows the profile
 * name (or a placeholder for unnamed sessions), a delete button, and
 * a resume arrow. Delete has a confirm step.
 */
export function ResumeMenu({ onResume, onBack }: Props) {
  const [sessions, setSessions] = useState<Session[]>(() => listResumable());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  function confirmDelete(id: string) {
    setPendingDeleteId(id);
  }

  function doDelete(id: string) {
    deleteSession(id);
    setSessions(listResumable());
    setPendingDeleteId(null);
  }

  function cancelDelete() {
    setPendingDeleteId(null);
  }

  if (sessions.length === 0) {
    return (
      <div className="screen screen--resume">
        <header className="screen__head">
          <h2 className="screen__title">resume</h2>
          <button className="btn btn--ghost" onClick={onBack}>BACK</button>
        </header>
        <p className="screen__lede">no sessions in progress.</p>
      </div>
    );
  }

  return (
    <div className="screen screen--resume">
      <header className="screen__head">
        <h2 className="screen__title">resume</h2>
        <button className="btn btn--ghost" onClick={onBack}>BACK</button>
      </header>

      <ul className="profile-list">
        {sessions.map((s) => {
          const name = s.profile?.identity.name ?? s.engine?.profile.identity.name ?? null;
          const label = name ?? 'unnamed';
          const date = new Date(s.last_active_at ?? s.started_at);
          const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const isPendingDelete = pendingDeleteId === s.id;

          return (
            <li key={s.id} className="profile-row">
              <div className="profile-row__name">{label}</div>
              <div className="profile-row__meta">
                <span className="profile-row__phase">{s.phase}</span>
                <span className="profile-row__date">{dateStr}</span>
              </div>
              {isPendingDelete ? (
                <div className="profile-row__confirm">
                  <span>delete {label}?</span>
                  <button className="btn btn--danger btn--sm" onClick={() => doDelete(s.id)}>
                    YES
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={cancelDelete}>
                    CANCEL
                  </button>
                </div>
              ) : (
                <div className="profile-row__actions">
                  <button
                    className="btn btn--danger btn--sm"
                    onClick={() => confirmDelete(s.id)}
                    aria-label={`delete ${label}`}
                  >
                    DELETE
                  </button>
                  <button
                    className="profile-row__resume"
                    onClick={() => onResume(s)}
                    aria-label={`resume ${label}`}
                  >
                    →
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
