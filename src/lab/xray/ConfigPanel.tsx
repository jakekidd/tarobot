// Every constant a live control — numbers and toggles. Changes apply
// to the running engine without a restart.

import { Panel, Stack } from '../lib';
import type { EnsembleConstants } from '../../pipeline/ensemble';

type Props = {
  constants: EnsembleConstants;
  onChange: (partial: Partial<EnsembleConstants>) => void;
};

const NUMERIC_KEYS = [
  'WORD_MAX',
  'FILL_K',
  'SILENCE_FILL',
  'FLIP_FILL',
  'START_BUDGET',
  'CAP_MIN',
  'CAP_MAX',
  'CARRY_VISITOR_WORDS',
  'CARRY_WINDOW',
  'RATIO_WINDOW',
  'CARRY_CAP_MIN',
  'AMMO_MAX_WORDS',
  'BANKED_THOUGHTS',
  'QUESTION_BUDGET',
  'NAMING_GRACE_BEATS',
  'COHERENCE_GATE',
  'CONJECTOR_WAKE_WORDS',
  'TISSUE_CAP',
  'FAN_MIN_NEW_WORDS',
  'FAN_BACKSTOP_TURNS',
  'FRAME_BACKSTOP_TURNS',
  'FRAME_MAX_WORDS',
  'TAIL_READS',
  'BEATS_WINDOW_DRIVER',
  'BEATS_WINDOW_ATTN',
  'FAN_DELTA_OVERLAP',
] as const;

export function ConfigPanel({ constants, onChange }: Props) {
  return (
    <Panel title="config" defaultOpen={false} meta="live">
      <Stack gap={3}>
        <label className="xray__config-row">
          <span>FAN_BLOCKING (await cognition before the driver)</span>
          <input
            type="checkbox"
            checked={constants.FAN_BLOCKING}
            onChange={(e) => onChange({ FAN_BLOCKING: e.target.checked })}
          />
        </label>
        <div className="xray__config-grid">
          {NUMERIC_KEYS.map((key) => (
            <label key={key} className="xray__config-row">
              <span>{key}</span>
              <input
                type="number"
                step={1}
                value={constants[key]}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n)) onChange({ [key]: n });
                }}
              />
            </label>
          ))}
        </div>
      </Stack>
    </Panel>
  );
}
