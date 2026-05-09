import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import type { EnrichedProfile, Reading } from '../pipeline';

type Props = {
  profile: EnrichedProfile;
  reading: Reading;
  onDone: () => void;
};

export function Closing({ reading, onDone }: Props) {
  const text = reading.closing_text || 'go on now. i\'ll be here when the moon turns.';
  return (
    <div className="screen screen--closing">
      <Reader />
      <Dialogue text={text} />
      <button className="btn btn--primary" onClick={onDone}>back to menu</button>
    </div>
  );
}
