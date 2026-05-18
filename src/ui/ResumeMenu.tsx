import { useState } from 'react';
import {
  clearActiveSession,
  deletePerson,
  listPeople,
  loadActiveSession,
  type Person,
  type Session,
} from '../storage';

type Props = {
  /** Resume the in-flight active session if any. App handles the routing. */
  onResumeActive: () => void;
  onBack: () => void;
};

/**
 * Two sections:
 *   1. Active session — at most one (an in-flight survey). Big RESUME button.
 *   2. People — durable records of prior visitors. Delete-only here; the
 *      RESUME-as-a-Person flow happens at name-input via the modal.
 */
export function ResumeMenu({ onResumeActive, onBack }: Props) {
  const [active, setActive] = useState<Session | null>(() => loadActiveSession());
  const [people, setPeople] = useState<Person[]>(() => listPeople());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  function discardActive() {
    clearActiveSession();
    setActive(null);
  }

  function doDeletePerson(id: string) {
    deletePerson(id);
    setPeople(listPeople());
    setPendingDeleteId(null);
  }

  const empty = !active && people.length === 0;

  return (
    <div className="screen screen--resume">
      <header className="screen__head">
        <h2 className="screen__title">resume</h2>
        <button className="btn btn--ghost" onClick={onBack}>BACK</button>
      </header>

      {empty && <p className="screen__lede">no prior visits.</p>}

      {active && (
        <section className="profile-list">
          <h3 className="screen__subhead">in progress</h3>
          <div className="profile-row">
            <div className="profile-row__name">{activeLabel(active)}</div>
            <div className="profile-row__meta">
              <span className="profile-row__phase">{active.phase}</span>
              <span className="profile-row__date">{formatDate(active.last_active_at ?? active.started_at)}</span>
            </div>
            <div className="profile-row__actions">
              <button
                className="profile-row__delete"
                onClick={discardActive}
                aria-label="discard in-progress session"
              >
                ✕
              </button>
              <button
                className="profile-row__resume"
                onClick={onResumeActive}
                aria-label="resume in-progress session"
              >
                →
              </button>
            </div>
          </div>
        </section>
      )}

      {people.length > 0 && (
        <section className="profile-list">
          <h3 className="screen__subhead">known visitors</h3>
          <p className="screen__hint">type your name on the next visit to be recognized.</p>
          <ul className="profile-list__items">
            {people.map((p) => {
              const isPendingDelete = pendingDeleteId === p.id;
              return (
                <li key={p.id} className="profile-row">
                  <div className="profile-row__name">{p.profile.name}</div>
                  <div className="profile-row__meta">
                    {p.profile.sun_sign && <span className="profile-row__phase">{p.profile.sun_sign}</span>}
                    <span className="profile-row__date">last seen {formatDate(p.last_visit_at)}</span>
                    <span className="profile-row__date">{p.history.visits.length} visit{p.history.visits.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="profile-row__actions" aria-hidden={isPendingDelete}>
                    <button
                      className="profile-row__delete"
                      onClick={() => setPendingDeleteId(p.id)}
                      aria-label={`delete ${p.profile.name}`}
                      disabled={isPendingDelete}
                    >
                      ✕
                    </button>
                  </div>
                  {isPendingDelete && (
                    <div className="profile-row__confirm" role="dialog" aria-label="confirm delete">
                      <span className="profile-row__confirm-prompt">delete {p.profile.name}?</span>
                      <button className="btn btn--danger btn--sm" onClick={() => doDeletePerson(p.id)}>
                        yes
                      </button>
                      <button className="btn btn--ghost btn--sm" onClick={() => setPendingDeleteId(null)}>
                        cancel
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function activeLabel(s: Session): string {
  const fromProfile = s.engine?.profile.name?.trim();
  if (fromProfile) return fromProfile;
  return 'unnamed visit';
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
