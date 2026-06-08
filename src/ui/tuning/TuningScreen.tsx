// TuningScreen — the thin UI for the Conjector. It drives whatever RailDriver
// the TuningEngine hands it (the ConjectorAgent), exactly the way the survey
// screen drives the IntroductionSurvey. Three renderable steps: a guess to
// rate cold/warm/hot, a reframe to confirm yes/no, and thinking (a stall while
// a model call is in flight). On `done` it hands up the ConjectorResult.

import { useEffect, useReducer, useState, type ReactNode } from 'react';
import { Reader } from '../reader/Reader';
import { Dialogue } from '../dialogue/Dialogue';
import type { RailDriver, RailStep } from '../../pipeline/rails/types';
import type { ConjectorResult } from '../../pipeline/tuning';
import './tuning.css';

function useRail(driver: RailDriver<ConjectorResult>): RailStep {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => driver.subscribe(force), [driver]);
  return driver.current();
}

type Props = {
  driver: RailDriver<ConjectorResult>;
  onDone: (result: ConjectorResult) => void;
};

export function TuningScreen({ driver, onDone }: Props) {
  const step = useRail(driver);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (step.kind !== 'done') return;
    const r = driver.result();
    if (r) onDone(r);
  }, [step.kind, driver, onDone]);

  let dialogue: ReactNode = null;
  let controls: ReactNode = null;

  if (step.kind === 'thinking') {
    dialogue = <Dialogue key="thinking" text="…" onTypingChange={setSpeaking} />;
  } else if (step.kind === 'guess') {
    dialogue = <Dialogue key={step.text} text={step.text} onTypingChange={setSpeaking} />;
    controls = (
      <div className="temp-choice">
        <button type="button" className="temp-choice__btn temp-choice__cold" onClick={() => driver.submit({ kind: 'temp', value: 'cold' })}>cold</button>
        <button type="button" className="temp-choice__btn temp-choice__warm" onClick={() => driver.submit({ kind: 'temp', value: 'warm' })}>warm</button>
        <button type="button" className="temp-choice__btn temp-choice__hot" onClick={() => driver.submit({ kind: 'temp', value: 'hot' })}>hot</button>
      </div>
    );
  } else if (step.kind === 'reframe') {
    dialogue = <Dialogue key={step.text} text={step.text} onTypingChange={setSpeaking} />;
    controls = (
      <div className="verdict-choice">
        <button type="button" className="verdict-choice__btn verdict-choice__yes" onClick={() => driver.submit({ kind: 'verdict', value: 'yes' })}>yes</button>
        <button type="button" className="verdict-choice__btn verdict-choice__no" onClick={() => driver.submit({ kind: 'verdict', value: 'no' })}>no</button>
      </div>
    );
  }

  return (
    <div className="screen screen--antechamber">
      <Reader isSpeaking={speaking} />
      <div className="antechamber__dialogue-host">{dialogue}</div>
      <div className="ui-frame ui-frame--antechamber">
        <div className="ui-frame__choices">{controls}</div>
      </div>
    </div>
  );
}
