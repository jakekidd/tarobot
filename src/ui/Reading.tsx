import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import type { DrawnCards, EnrichedProfile, Reading as ReadingT } from '../pipeline';

type Props = {
  profile: EnrichedProfile;
  drawn: DrawnCards;
  reading: ReadingT;
  onComplete: () => void;
  onCancel: () => void;
};

// Stub. Real reveal-loop UI lands in build step 8.
export function Reading({ onCancel, onComplete }: Props) {
  return (
    <div className="screen screen--reading">
      <Reader />
      <Dialogue text="the reveal loop is being woven…" />
      <div className="placeholder">
        <p>phase: reading</p>
        <button className="btn btn--ghost" onClick={onCancel}>back to menu</button>
        <button className="btn btn--primary" onClick={onComplete}>(skip to closing)</button>
      </div>
    </div>
  );
}
