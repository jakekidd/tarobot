// CompilingScreen — the beat between the antechamber closing and the
// reading, while the Compiler writes the brief and the cards are dealt.
// One turtle line covers the latency; the turtle disintegrates when the
// brief is ready and the reading takes the stage.

import { Reader } from '../reader/Reader';
import { Dialogue } from '../dialogue/Dialogue';
import './tuning.css';

export function CompilingScreen() {
  return (
    <div className="screen screen--antechamber">
      <Reader isSpeaking />
      <div className="antechamber__dialogue-host">
        <Dialogue text="hold still — i'm cutting your cards." />
      </div>
    </div>
  );
}
