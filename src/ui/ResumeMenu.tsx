import { useState } from 'react';
import { deletePerson, listPeople, type Person } from '../storage';

type Props = {
  onBack: () => void;
};

/**
 * Known visitors list. Each row shows the Person's name + sun sign +
 * last-seen date + visit count, with a delete button. There is no
 * "resume" button here — to resume a Person, the user types their name
 * on a new visit and the returning-user modal handles the rest.
 *
 * In-progress survey sessions live in storage under `tarobot:active_session`
 * for debugging but are not surfaced in this menu. The redesign chose
 * Person-as-durable / Session-as-volatile; that's the design contract.
 */
export function ResumeMenu({ onBack }: Props) {
  const [people, setPeople] = useState<Person[]>(() => listPeople());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  function doDeletePerson(id: string) {
    deletePerson(id);
    setPeople(listPeople());
    setPendingDeleteId(null);
  }

  return (
    <div className="screen screen--resume">
      <header className="screen__head">
        <h2 className="screen__title">resume</h2>
        <button className="btn btn--ghost" onClick={onBack}>BACK</button>
      </header>

      {people.length === 0 && <p className="screen__lede">no prior visits.</p>}

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

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
