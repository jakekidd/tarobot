// Bench — entry point for the dev app.
//
// Tabs across the top — DOWSER (focus rig for refining the
// dowser prompt against a known persona) and ALL (the full
// pipeline inspector). Bench owns its whole visual surface;
// App.tsx hides the main-app chrome (CRT filter, three.js scene)
// when phase.kind === 'bench'.

import './bench.css';
import { useState } from 'react';
import { Button } from './lib';
import { Dowser } from './views/Dowser';
import { Run } from './views/Run';
import { Sandbox } from './views/Sandbox';

type Props = {
  apiKey: string;
  onExit: () => void;
};

type Tab = 'dowser' | 'all' | 'sandbox';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dowser', label: 'dowser' },
  { id: 'all', label: 'all' },
  { id: 'sandbox', label: 'sandbox' },
];

export function Bench({ apiKey, onExit }: Props) {
  const [tab, setTab] = useState<Tab>('dowser');

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
              className={`bench__tab ${tab === t.id ? 'bench__tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <main className={`bench__main ${tab === 'sandbox' ? 'bench__main--wide' : ''}`}>
          {tab === 'dowser' && <Dowser apiKey={apiKey} />}
          {tab === 'all' && <Run apiKey={apiKey} />}
          {tab === 'sandbox' && <Sandbox apiKey={apiKey} />}
        </main>
      </div>
    </div>
  );
}
