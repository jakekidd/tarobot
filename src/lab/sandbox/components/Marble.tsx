// Sandbox primitive — Marble.
//
// A circular agent token. Title inside, color tint from the agent's
// assigned hex. Clickable; selected state gets a thicker ring in
// the agent's own color so it pops against the page.

import type { SandboxAgent } from '../types';

type Props = {
  agent: SandboxAgent;
  selected?: boolean;
  onClick?: () => void;
};

export function Marble({ agent, selected, onClick }: Props) {
  const cls = `sb-marble ${selected ? 'sb-marble--selected' : ''}`;
  const style = {
    backgroundColor: hexWithAlpha(agent.color, 0.12),
    borderColor: agent.color,
    color: agent.color,
  } as const;
  return (
    <button
      type="button"
      className={cls}
      style={style}
      onClick={onClick}
      title={agent.name}
    >
      <span className="sb-marble__label">{agent.name}</span>
    </button>
  );
}

/** Convert a #RRGGBB hex into rgba(r,g,b,a) for the background tint. */
function hexWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
