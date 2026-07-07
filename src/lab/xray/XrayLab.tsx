// The xray lab — the ensemble reading engine's debug surface. Its own
// world like Bench: no CRT filter, no three.js scene. P0 stub: the route
// exists so every later phase lands inside it; the real surface (table,
// piles, hot-path panes, arms) arrives per ENSEMBLE-PLAN.md §7.

type Props = {
  onExit: () => void;
};

export function XrayLab({ onExit }: Props) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0b0812',
        color: '#b8a6d9',
        fontFamily: 'monospace',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
      }}
    >
      <div style={{ fontSize: '1.4rem', letterSpacing: '0.2em' }}>xray lab</div>
      <div style={{ opacity: 0.7 }}>
        ensemble reading engine — surface lands in p2 (ENSEMBLE-PLAN.md)
      </div>
      <button
        type="button"
        onClick={onExit}
        style={{
          background: 'transparent',
          border: '1px solid #b8a6d9',
          color: '#b8a6d9',
          fontFamily: 'monospace',
          padding: '0.4rem 1.2rem',
          cursor: 'pointer',
        }}
      >
        exit
      </button>
    </div>
  );
}
