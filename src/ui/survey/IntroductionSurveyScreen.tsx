// IntroductionSurveyScreen — the thin UI that renders whatever the survey's
// RailDriver hands it. It knows about steps (name / choice / birthdate /
// done), not about facets or RawPortraits — that logic lives in the
// (backend-portable) business object. Swap the driver for a remote one and
// this screen doesn't change.

import { useEffect, useReducer, useState } from 'react';
import { Reader } from '../reader/Reader';
import { Dialogue } from '../dialogue/Dialogue';
import { MultipleChoice } from '../choices/MultipleChoice';
import { ChatInput } from '../ChatInput';
import { BirthdayForm } from '../antechamber/BirthdayForm';
import { NameStep } from './NameStep';
import type { IntroductionSurvey, RawPortrait } from '../../pipeline/introduction-survey';
import type { RailStep } from '../../pipeline/rails/types';
import './survey.css';

/** Subscribe to a rail driver and re-render on its emits. `current()` is
 *  cheap and pure, so we just call it fresh each render — no snapshot
 *  memoization needed. */
function useRail(driver: IntroductionSurvey): RailStep {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => driver.subscribe(force), [driver]);
  return driver.current();
}

type Props = {
  driver: IntroductionSurvey;
  onDone: (raw: RawPortrait) => void;
};

export function IntroductionSurveyScreen({ driver, onDone }: Props) {
  const step = useRail(driver);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (step.kind !== 'done') return;
    const raw = driver.result();
    if (raw) onDone(raw);
  }, [step.kind, driver, onDone]);

  const prompt =
    step.kind === 'choice'
      ? step.prompt
      : step.kind === 'name'
        ? 'before we begin — what do they call you?'
        : step.kind === 'birthdate'
          ? 'and when were you born?'
          : '';
  const dialogKey = step.kind === 'choice' ? step.slug : step.kind;

  return (
    <div className="screen screen--antechamber">
      <Reader isSpeaking={speaking} />

      <div className="antechamber__dialogue-host">
        <Dialogue key={dialogKey} text={prompt} onTypingChange={setSpeaking} />
      </div>

      <div className="ui-frame ui-frame--antechamber">
        <div className="ui-frame__choices">
          {step.kind === 'name' && (
            <NameStep
              onSubmit={(name, color) => driver.submit({ kind: 'name', name, color })}
            />
          )}

          {step.kind === 'choice' && (
            <>
              <MultipleChoice
                key={step.slug}
                suggestions={step.options}
                onPick={(v) => driver.submit({ kind: 'choice', value: v })}
              />
              <div className="ui-frame__custom-input">
                <ChatInput
                  placeholder="or type your own answer"
                  disabled={false}
                  onSend={(text) => driver.submit({ kind: 'choice', value: text })}
                />
              </div>
            </>
          )}

          {step.kind === 'birthdate' && (
            <BirthdayForm onSubmit={(iso) => driver.submit({ kind: 'birthdate', iso })} />
          )}
        </div>
      </div>
    </div>
  );
}
