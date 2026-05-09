import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import type { DrawnCards, EnrichedProfile, Reading } from '../pipeline';

type Props = {
  apiKey: string;
  profile: EnrichedProfile;
  drawn: DrawnCards;
  onReady: (reading: Reading) => void;
  onCancel: () => void;
};

// Stub. Real placement (Three.js + parallel reading construction) lands in build steps 7–8.
export function Placement({ onCancel }: Props) {
  return (
    <div className="screen screen--placement">
      <Reader mood="flipping" />
      <Dialogue text="i lay them in their places…" />
      <div className="placeholder">
        <p>phase: placement</p>
        <p>todo: Three.js card lay-down animation + kick off constructReading</p>
        <button className="btn btn--ghost" onClick={onCancel}>back to menu</button>
      </div>
    </div>
  );
}
