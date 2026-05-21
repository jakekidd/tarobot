import { useState } from 'react';
import { deletePerson, listPeople, type Person } from '../storage';

type Props = {
  onBack: () => void;
  /** Click LOAD on a row → app routes into Survey with this Person
   *  pre-loaded, skipping the questions and going straight to the
   *  intention prompt. */
  onLoad?: (person: Person) => void;
};

/**
 * Known visitors list. Each row shows the Person's name + sun sign +
 * last-seen date + intention count, with LOAD and delete buttons.
 * LOAD hydrates the engine from the saved snapshot and jumps to the
 * intention question; the survey is skipped.
 */
export function ResumeMenu({ onBack, onLoad }: Props) {
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
          <p className="screen__hint">LOAD jumps straight to a new intention — no survey to retake.</p>
          <ul className="profile-list__items">
            {people.map((p) => {
              const isPendingDelete = pendingDeleteId === p.id;
              const intentionCount = p.intentions?.length ?? 0;
              return (
                <li key={p.id} className="profile-row">
                  <div className="profile-row__name">{p.profile.name}</div>
                  <div className="profile-row__meta">
                    {p.profile.sun_sign && <span className="profile-row__phase">{p.profile.sun_sign}</span>}
                    <span className="profile-row__date">last seen {formatDate(p.last_visit_at)}</span>
                    <span className="profile-row__date">
                      {intentionCount} {intentionCount === 1 ? 'reading' : 'readings'}
                    </span>
                  </div>
                  <div className="profile-row__actions" aria-hidden={isPendingDelete}>
                    {onLoad && (
                      <button
                        className="profile-row__load"
                        onClick={() => onLoad(p)}
                        aria-label={`load ${p.profile.name}`}
                        disabled={isPendingDelete}
                      >
                        LOAD
                      </button>
                    )}
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
