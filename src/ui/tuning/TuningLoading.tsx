// TuningLoading — the beat between the survey closing and the Conjector's
// first guess, while the Condenser paints the Portrait (~one Sonnet call). A
// single turtle line covers the latency and hands off to the Diviner.

import { Reader } from '../reader/Reader';
import { Dialogue } from '../dialogue/Dialogue';
import './tuning.css';

export function TuningLoading() {
  return (
    <div className="screen screen--antechamber">
      <Reader isSpeaking />
      <div className="antechamber__dialogue-host">
        <Dialogue text="mm. let me look at you a moment." />
      </div>
    </div>
  );
}
