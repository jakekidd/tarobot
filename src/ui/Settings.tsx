import { useState } from 'react';
import { PERSONAS, type PersonaId } from '../pipeline';
import {
  clearAllExceptKey,
  clearApiKey,
  loadSettings,
  saveSettings,
} from '../storage';
import { setVolume } from './sound/sound';

type Props = {
  onBack: () => void;
};

export function Settings({ onBack }: Props) {
  const [settings, setSettings] = useState(() => loadSettings());

  function update(patch: Partial<typeof settings>) {
    const next = saveSettings(patch);
    setSettings(next);
    if ('soundOn' in patch) setVolume(patch.soundOn ? 0.18 : 0);
  }

  return (
    <div className="screen screen--settings">
      <header className="screen__head">
        <h2 className="screen__title">settings</h2>
        <button className="btn btn--ghost" onClick={onBack}>back</button>
      </header>

      {/* Persona section — not wired through to the reading construction
          yet, so disabled in the UI. Sample text refreshed for when it's
          re-enabled. */}
      <section className="settings__section settings__section--disabled">
        <h3 className="settings__heading">voice</h3>
        <p className="settings__hint">which tarobot reads you tonight. <span className="settings__todo">TODO — not yet wired</span></p>
        <div className="settings__personas">
          {(Object.keys(PERSONAS) as PersonaId[]).map((id) => {
            const p = PERSONAS[id];
            const selected = settings.personaId === id;
            return (
              <button
                key={id}
                type="button"
                className={`persona-card ${selected ? 'persona-card--on' : ''}`}
                disabled
                aria-disabled
              >
                <div className="persona-card__name">{p.name}</div>
                <div className="persona-card__label">{p.short_label}</div>
                <div className="persona-card__sample">{p.example_line}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings__section">
        <h3 className="settings__heading">sound</h3>
        <label className="settings__row">
          <input
            type="checkbox"
            checked={settings.soundOn}
            onChange={(e) => update({ soundOn: e.target.checked })}
          />
          <span>typewriter blips, chimes, card flips</span>
        </label>
      </section>

      <section className="settings__section">
        <h3 className="settings__heading">dialogue speed</h3>
        <label className="settings__row">
          <input
            type="range"
            min={10}
            max={80}
            step={1}
            value={settings.charDelayMs}
            onChange={(e) => update({ charDelayMs: parseInt(e.target.value, 10) })}
          />
          <span>{settings.charDelayMs} ms / char</span>
        </label>
      </section>

      <section className="settings__section">
        <h3 className="settings__heading">danger zone</h3>
        <p className="settings__hint">these actions cannot be undone.</p>
        <div className="settings__danger-row">
          <button
            className="btn btn--danger"
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
            className="btn btn--danger"
            onClick={() => {
              if (confirm('reset the stored api key? you will be asked for a new one.')) {
                clearApiKey();
                window.location.reload();
              }
            }}
          >
            reset api key
          </button>
        </div>
      </section>
    </div>
  );
}
