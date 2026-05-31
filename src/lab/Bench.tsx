// Bench — entry point for the dev app.
//
// Single-route in v1: Run (the live session inspector). The shell
// renders a header with title + nav back to main menu, and the active
// view below.

import './bench.css';
import { Button } from './lib';
import { Run } from './views/Run';

type Props = {
  apiKey: string;
  onExit: () => void;
};

export function Bench({ apiKey, onExit }: Props) {
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
        <main className="bench__main">
          <Run apiKey={apiKey} />
        </main>
      </div>
    </div>
  );
}
