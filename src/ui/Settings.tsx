import { useState } from 'react';
import { PERSONAS, type PersonaId } from '../pipeline';
import { loadSettings, saveSettings } from '../storage';
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

      <section className="settings__section">
        <h3 className="settings__heading">voice</h3>
        <p className="settings__hint">which tarobot reads you tonight.</p>
        <div className="settings__personas">
          {(Object.keys(PERSONAS) as PersonaId[]).map((id) => {
            const p = PERSONAS[id];
            const selected = settings.personaId === id;
            return (
              <button
                key={id}
                type="button"
                className={`persona-card ${selected ? 'persona-card--on' : ''}`}
                onClick={() => update({ personaId: id })}
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
    </div>
  );
}
