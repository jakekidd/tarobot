// Every constant a live control — numbers, toggles, and the stall
// weights. Changes apply to the running engine without a restart.

import { Panel, Stack } from '../lib';
import {
  STALL_KINDS,
  type EnsembleConstants,
  type StallKind,
} from '../../pipeline/ensemble';

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
  'CARRY_RATIO',
  'RATIO_WINDOW',
  'CARRY_CAP_MIN',
  'AMMO_MAX_WORDS',
  'FAN_MIN_NEW_WORDS',
  'FAN_BACKSTOP_TURNS',
  'FRAME_BACKSTOP_TURNS',
  'FRAME_MAX_WORDS',
  'STALL_MAX_CONSECUTIVE',
  'TAIL_READS',
  'TAIL_THOUGHTS',
  'TAIL_QUESTIONS',
  'TAIL_BITS',
  'LEDGER_CAP',
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
                step={key === 'CARRY_RATIO' ? 0.05 : 1}
                value={constants[key]}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n)) onChange({ [key]: n });
                }}
              />
            </label>
          ))}
        </div>
        <div>
          <div className="bench__section-title">stall weights</div>
          <div className="xray__config-grid">
            {STALL_KINDS.map((kind: StallKind) => (
              <label key={kind} className="xray__config-row">
                <span>{kind}</span>
                <input
                  type="number"
                  min={0}
                  value={constants.STALL_WEIGHTS[kind]}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isNaN(n)) return;
                    onChange({
                      STALL_WEIGHTS: { ...constants.STALL_WEIGHTS, [kind]: n },
                    });
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      </Stack>
    </Panel>
  );
}
