// Relationship-status opener. Six tasteful, broadly-inclusive buckets.
// Order is load-bearing: "single" first so the answer doesn't feel
// ranked; "prefer not to say" last so it's an opt-out. The engine
// stores the picked label on profile.relationship_status (or null for
// the opt-out).

import { RELATIONSHIP_STATUS_OPTIONS } from '../../pipeline/survey/types';

type Props = {
  onPick: (status: string) => void;
};

export function RelationshipStatusForm({ onPick }: Props) {
  return (
    <div className="multiple-choice">
      {RELATIONSHIP_STATUS_OPTIONS.map((opt) => (
        <button
          key={opt}
          className="btn btn--ghost btn--choice"
          onClick={() => onPick(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
