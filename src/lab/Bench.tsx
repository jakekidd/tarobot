// Bench — entry point for the dev app.
//
// Tabs across the top — DIVINER (focus rig for refining the
// diviner prompt against a known persona) and ALL (the full
// pipeline inspector). Bench owns its whole visual surface;
// App.tsx hides the main-app chrome (CRT filter, three.js scene)
// when phase.kind === 'bench'.

import './bench.css';
import './persona/persona.css';
import { useState } from 'react';
import { Button } from './lib';
import { Diviner } from './views/Diviner';
import { Run } from './views/Run';
import { Sandbox } from './views/Sandbox';
import { PersonaSandbox } from './persona/PersonaSandbox';

type Props = {
  apiKey: string;
  onExit: () => void;
};

type Tab = 'persona' | 'diviner' | 'all' | 'sandbox';

// Other tabs are temporarily disabled while the persona sandbox is the
// focus. Flip `disabled` off to bring them back.
const TABS: { id: Tab; label: string; disabled?: boolean }[] = [
  { id: 'persona', label: 'persona' },
  { id: 'diviner', label: 'diviner', disabled: true },
  { id: 'all', label: 'all', disabled: true },
  { id: 'sandbox', label: 'sandbox', disabled: true },
];

export function Bench({ apiKey, onExit }: Props) {
  const [tab, setTab] = useState<Tab>('persona');

  return (
    <div className="bench">
      <div className="bench__shell">
        <header className="bench__header">
          <div className="bench__brand">
            <span className="bench__title">bench</span>
            <span className="bench__subtitle">tarobot · pipeline lab</span>
          </div>
          <div className="bench__nav">
            <Button onClick={onExit} variant="ghost">← back to menu</Button>
          </div>
        </header>
        <nav className="bench__tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              disabled={t.disabled}
              title={t.disabled ? 'temporarily disabled' : undefined}
              className={`bench__tab ${tab === t.id ? 'bench__tab--active' : ''} ${t.disabled ? 'bench__tab--disabled' : ''}`}
              onClick={() => { if (!t.disabled) setTab(t.id); }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <main className={`bench__main ${tab === 'sandbox' || tab === 'persona' ? 'bench__main--wide' : ''}`}>
          {tab === 'persona' && <PersonaSandbox apiKey={apiKey} />}
          {tab === 'diviner' && <Diviner apiKey={apiKey} />}
          {tab === 'all' && <Run apiKey={apiKey} />}
          {tab === 'sandbox' && <Sandbox apiKey={apiKey} />}
        </main>
      </div>
    </div>
  );
}
