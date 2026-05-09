import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import type { BaseProfile, EnrichedProfile } from '../pipeline';

type Props = {
  apiKey: string;
  base: BaseProfile;
  onFinalized: (profile: EnrichedProfile) => void;
  onCancel: () => void;
};

// Stub. Real cognition wiring lands in build step 5–6.
export function Interview({ base, onCancel }: Props) {
  return (
    <div className="screen screen--interview">
      <Reader />
      <Dialogue text={`hello, ${base.survey.name}. i can't quite reach you yet — interview cognition is still being assembled.`} />
      <div className="placeholder">
        <p>phase: interview</p>
        <p>todo: implement interviewTurn + finalizeProfile</p>
        <button className="btn btn--ghost" onClick={onCancel}>back to menu</button>
      </div>
    </div>
  );
}
