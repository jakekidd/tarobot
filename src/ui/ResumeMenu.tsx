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
          const name = sessionName(s);
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
              <div className="profile-row__actions" aria-hidden={isPendingDelete}>
                <button
                  className="profile-row__delete"
                  onClick={() => confirmDelete(s.id)}
                  aria-label={`delete ${label}`}
                  disabled={isPendingDelete}
                >
                  ✕
                </button>
                <button
                  className="profile-row__resume"
                  onClick={() => onResume(s)}
                  aria-label={`resume ${label}`}
                  disabled={isPendingDelete}
                >
                  →
                </button>
              </div>
              {isPendingDelete && (
                <div className="profile-row__confirm" role="dialog" aria-label="confirm delete">
                  <span className="profile-row__confirm-prompt">delete {label}?</span>
                  <button className="btn btn--danger btn--sm" onClick={() => doDelete(s.id)}>
                    yes
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={cancelDelete}>
                    cancel
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

/**
 * Best-effort display name for a Session:
 *   1. tent profile (compiled),
 *   2. engine state's profile,
 *   3. the user's answer to the survey's "name-input" question.
 * Returns null if none of those exist yet.
 */
function sessionName(s: Session): string | null {
  const fromProfile = s.profile?.identity.name ?? s.engine?.profile.identity.name;
  if (fromProfile && fromProfile.trim()) return fromProfile.trim();
  const fromSurvey = s.survey?.answers.find((a) => a.question_id === 'name-input')?.picked[0];
  if (fromSurvey && fromSurvey.trim()) return fromSurvey.trim();
  return null;
}
