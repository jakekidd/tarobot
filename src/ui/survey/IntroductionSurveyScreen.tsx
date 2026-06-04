// IntroductionSurveyScreen — the thin UI that renders whatever the survey's
// RailDriver hands it. It owns three bits of pure-UI state the business logic
// doesn't care about: the live name-sensing (mirrored into the dialogue), the
// do-you-mind gag interlude (a false choice between name and the facets), and
// the undo chevron. The survey logic stays backend-portable underneath.

import { useEffect, useReducer, useState, type ReactNode } from 'react';
import { Reader } from '../reader/Reader';
import { Dialogue } from '../dialogue/Dialogue';
import { MultipleChoice } from '../choices/MultipleChoice';
import { ChatInput } from '../ChatInput';
import { BirthdayForm } from '../antechamber/BirthdayForm';
import { UndoIcon } from '../icons/UndoIcon';
import { NameStep } from './NameStep';
import { NameDialogue } from './NameDialogue';
import { GagChoice } from './GagChoice';
import type { IntroductionSurvey, RawPortrait } from '../../pipeline/introduction-survey';
import type { RailStep } from '../../pipeline/rails/types';
import './survey.css';

const NAME_QUESTION = 'hi. welcome. what should i call you?';
const GAG_QUESTION = 'do you mind if i ask you some questions to get to know you better?';
const GAG_THANKS =
  'thanks! just answer to the best of your ability. and be sure to use the write-in when a particular answer comes to mind. consider these questions as much an icebreaker as they are a warm-up, an exercise to help you get out of your shell!';

function useRail(driver: IntroductionSurvey): RailStep {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => driver.subscribe(force), [driver]);
  return driver.current();
}

type Gag = 'idle' | 'asking' | 'thanks';

type Props = {
  driver: IntroductionSurvey;
  onDone: (raw: RawPortrait) => void;
};

export function IntroductionSurveyScreen({ driver, onDone }: Props) {
  const step = useRail(driver);
  const [speaking, setSpeaking] = useState(false);
  const [sensing, setSensing] = useState<{ name: string; color: string }>({ name: '', color: '' });
  const [gag, setGag] = useState<Gag>('idle');
  const [askReady, setAskReady] = useState(false);
  const [thanksReady, setThanksReady] = useState(false);

  useEffect(() => {
    if (step.kind !== 'done') return;
    const raw = driver.result();
    if (raw) onDone(raw);
  }, [step.kind, driver, onDone]);

  function handleName(name: string, color: string) {
    driver.submit({ kind: 'name', name, color });
    setSensing({ name: '', color: '' });
    setGag('asking');
  }

  const showUndo =
    gag === 'idle' && (step.kind === 'choice' || step.kind === 'birthdate') && driver.canUndo();

  let dialogue: ReactNode = null;
  if (step.kind === 'name') {
    dialogue = <NameDialogue question={NAME_QUESTION} name={sensing.name} color={sensing.color} />;
  } else if (gag === 'asking') {
    dialogue = (
      <Dialogue key="gag-ask" text={GAG_QUESTION} onTypingChange={setSpeaking} onDone={() => setAskReady(true)} />
    );
  } else if (gag === 'thanks') {
    dialogue = (
      <Dialogue
        key="gag-thanks"
        text={GAG_THANKS}
        onTypingChange={setSpeaking}
        onDone={() => setThanksReady(true)}
      />
    );
  } else if (step.kind === 'choice') {
    dialogue = <Dialogue key={step.slug} text={step.prompt} onTypingChange={setSpeaking} />;
  } else if (step.kind === 'birthdate') {
    dialogue = <Dialogue key="bday" text="and when were you born?" onTypingChange={setSpeaking} />;
  }

  let choices: ReactNode = null;
  if (step.kind === 'name') {
    choices = <NameStep onChange={(name, color) => setSensing({ name, color })} onSubmit={handleName} />;
  } else if (gag === 'asking') {
    // Hold the choices until the dialogue has typed out + a beat (GagChoice
    // staggers Yes then No on its own once it mounts).
    choices = askReady ? <GagChoice onChoose={() => { setGag('thanks'); setAskReady(false); }} /> : null;
  } else if (gag === 'thanks') {
    // No auto-advance — the player clicks to continue once it's typed out.
    choices = thanksReady ? (
      <button
        type="button"
        className="centenarian-continue"
        onClick={() => { setGag('idle'); setThanksReady(false); }}
        aria-label="continue"
      >
        <span className="centenarian-continue__arrow">▾</span>
      </button>
    ) : null;
  } else if (step.kind === 'choice') {
    choices = (
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
    );
  } else if (step.kind === 'birthdate') {
    choices = <BirthdayForm onSubmit={(iso) => driver.submit({ kind: 'birthdate', iso })} />;
  }

  return (
    <div className="screen screen--antechamber">
      <Reader isSpeaking={speaking} />

      {showUndo && (
        <button
          type="button"
          className="survey__undo"
          onClick={() => driver.undo()}
          aria-label="undo last answer"
          title="undo last answer"
        >
          <UndoIcon size="1.4rem" />
        </button>
      )}

      <div className={`antechamber__dialogue-host${gag === 'thanks' ? ' survey__dialogue-host--tall' : ''}`}>
        {dialogue}
      </div>

      <div className="ui-frame ui-frame--antechamber">
        <div className="ui-frame__choices">{choices}</div>
      </div>
    </div>
  );
}
