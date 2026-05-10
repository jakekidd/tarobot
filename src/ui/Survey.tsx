import { useMemo, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import type {
  ComingWith,
  EnrichedProfile,
  Familiar,
  RegisterPick,
  Survey as SurveyData,
  WantFromReading,
} from '../pipeline';

type Props = {
  onComplete: (survey: SurveyData) => void;
  onCancel: () => void;
  existingProfiles: EnrichedProfile[];
  onUseExistingProfile: (profile: EnrichedProfile) => void;
};

type Step =
  | 'name'
  | 'birthday'
  | 'coming_with'
  | 'register'
  | 'familiar'
  | 'on_my_mind'
  | 'want'
  | 'review';

const ORDER: Step[] = [
  'name',
  'birthday',
  'coming_with',
  'register',
  'familiar',
  'on_my_mind',
  'want',
  'review',
];

const PROMPTS: Record<Step, string> = {
  name: 'first — what do they call you?',
  birthday: 'when were you born? month and day. leave blank if you\'d rather not.',
  coming_with: 'who came with you tonight?',
  register: 'pick the word your year has felt like.',
  familiar: 'pick a creature. don\'t think.',
  on_my_mind: 'anything pressing on your mind? a sentence — or skip past with enter.',
  want: 'what would you like to leave with?',
  review: 'good. let me look at you for a moment.',
};

const COMING_WITH: ComingWith[] = ['alone', 'partner', 'friends', 'family'];
const REGISTER: RegisterPick[] = ['chaos', 'clarity', 'comfort', 'change'];
const FAMILIAR: Familiar[] = ['raven', 'serpent', 'wolf', 'cat', 'moth', 'fox'];
const WANT: WantFromReading[] = ['laugh', 'warning', 'clarity', 'unsure'];

export function Survey({ onComplete, existingProfiles, onUseExistingProfile }: Props) {
  const [step, setStep] = useState<Step>('name');
  const [speaking, setSpeaking] = useState(false);

  const [name, setName] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [comingWith, setComingWith] = useState<ComingWith | undefined>();
  const [register, setRegister] = useState<RegisterPick | undefined>();
  const [familiar, setFamiliar] = useState<Familiar | undefined>();
  const [onMyMind, setOnMyMind] = useState('');
  const [want, setWant] = useState<WantFromReading | undefined>();

  const survey: SurveyData = useMemo(() => ({
    name: name.trim(),
    birth_month_day: birthMonth && birthDay
      ? `${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`
      : undefined,
    coming_with: comingWith,
    register_pick: register,
    familiar_pick: familiar,
    on_my_mind: onMyMind.trim() ? onMyMind.trim().slice(0, 200) : undefined,
    want_from_reading: want,
  }), [name, birthMonth, birthDay, comingWith, register, familiar, onMyMind, want]);

  const idx = ORDER.indexOf(step);
  const next = () => setStep(ORDER[Math.min(ORDER.length - 1, idx + 1)]!);

  const canAdvanceName = name.trim().length > 0;

  return (
    <div className="screen screen--survey">
      <Reader isSpeaking={speaking} />
      <Dialogue
        key={step}
        text={PROMPTS[step]}
        onTypingChange={setSpeaking}
      />

      <div className="ui-frame ui-frame--survey">
        <div className="ui-frame__choices">
          {step === 'name' && (
            <NameStep
              name={name}
              setName={setName}
              existingProfiles={existingProfiles}
              onUseExistingProfile={onUseExistingProfile}
              onAdvance={() => canAdvanceName && next()}
            />
          )}

          {step === 'birthday' && (
            <BirthdayStep
              month={birthMonth}
              day={birthDay}
              setMonth={setBirthMonth}
              setDay={setBirthDay}
              onAdvance={next}
            />
          )}

          {step === 'coming_with' && (
            <ChipRow
              options={COMING_WITH}
              selected={comingWith}
              onSelect={(v) => { setComingWith(v); next(); }}
            />
          )}

          {step === 'register' && (
            <ChipRow
              options={REGISTER}
              selected={register}
              onSelect={(v) => { setRegister(v); next(); }}
            />
          )}

          {step === 'familiar' && (
            <ChipRow
              options={FAMILIAR}
              selected={familiar}
              onSelect={(v) => { setFamiliar(v); next(); }}
            />
          )}

          {step === 'on_my_mind' && (
            <OnMyMindStep
              value={onMyMind}
              setValue={setOnMyMind}
              onAdvance={next}
            />
          )}

          {step === 'want' && (
            <ChipRow
              options={WANT}
              selected={want}
              onSelect={(v) => { setWant(v); next(); }}
            />
          )}

          {step === 'review' && (
            <div className="survey__review">
              <p>name: <em>{survey.name}</em></p>
              {survey.birth_month_day && <p>born: {survey.birth_month_day}</p>}
              {survey.coming_with && <p>here with: {survey.coming_with}</p>}
              {survey.register_pick && <p>your year: {survey.register_pick}</p>}
              {survey.familiar_pick && <p>creature: {survey.familiar_pick}</p>}
              {survey.on_my_mind && <p>on your mind: <em>{survey.on_my_mind}</em></p>}
              {survey.want_from_reading && <p>looking for: {survey.want_from_reading}</p>}
              <div className="survey__review-confirm">
                <button
                  className="btn btn--chrome"
                  onClick={() => onComplete(survey)}
                >
                  begin the interview
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step components ──────────────────────────────────────

function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: readonly T[];
  selected: T | undefined;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="chip-row">
      {options.map((opt) => (
        <button
          key={opt}
          className={`choice-button ${selected === opt ? 'choice-button--on' : ''}`}
          onClick={() => onSelect(opt)}
        >
          <span className="choice-button__text">{opt}</span>
        </button>
      ))}
    </div>
  );
}

function NameStep({
  name,
  setName,
  existingProfiles,
  onUseExistingProfile,
  onAdvance,
}: {
  name: string;
  setName: (n: string) => void;
  existingProfiles: EnrichedProfile[];
  onUseExistingProfile: (profile: EnrichedProfile) => void;
  onAdvance: () => void;
}) {
  const collision = existingProfiles.find(
    (p) => p.name.trim().toLowerCase() === name.trim().toLowerCase() && name.trim().length > 0,
  );
  const [pendingPickProfile, setPendingPickProfile] = useState<EnrichedProfile | null>(null);

  return (
    <div className="name-step">
      {existingProfiles.length > 0 && (
        <div className="name-step__memory">
          <div className="name-step__memory-label">i remember:</div>
          <div className="name-step__memory-row">
            {existingProfiles.slice(0, 6).map((p) => (
              <button
                key={p.name}
                className="choice-button choice-button--mini"
                onClick={() => setPendingPickProfile(p)}
                type="button"
              >
                <span className="choice-button__text">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); onAdvance(); }}
        className="name-step__form"
      >
        <input
          className="text-input text-input--ghost"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="your name"
          autoFocus
          autoCapitalize="words"
          autoComplete="given-name"
        />
        <button
          type="submit"
          className="btn btn--chrome btn--send"
          disabled={name.trim().length === 0}
        >
          enter
        </button>
      </form>

      {collision && !pendingPickProfile && (
        <div className="name-step__collision">
          <span>i remember a {collision.name}.</span>
          <button
            className="btn btn--chrome btn--sm"
            type="button"
            onClick={() => onUseExistingProfile(collision)}
          >
            use last profile
          </button>
          <span className="name-step__collision-or">or hit enter to rebuild</span>
        </div>
      )}

      {pendingPickProfile && (
        <div className="name-step__collision">
          <span>{pendingPickProfile.name} — what do you want?</span>
          <button
            className="btn btn--chrome btn--sm"
            type="button"
            onClick={() => onUseExistingProfile(pendingPickProfile)}
          >
            use last profile
          </button>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => {
              setName(pendingPickProfile.name);
              setPendingPickProfile(null);
            }}
          >
            rebuild
          </button>
        </div>
      )}
    </div>
  );
}

function BirthdayStep({
  month,
  day,
  setMonth,
  setDay,
  onAdvance,
}: {
  month: string;
  day: string;
  setMonth: (s: string) => void;
  setDay: (s: string) => void;
  onAdvance: () => void;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onAdvance(); }}
      className="birthday-step"
    >
      <div className="birthday-row">
        <input
          className="text-input text-input--ghost text-input--narrow"
          inputMode="numeric"
          maxLength={2}
          value={month}
          onChange={(e) => setMonth(e.target.value.replace(/\D/g, ''))}
          placeholder="MM"
          autoFocus
        />
        <span>/</span>
        <input
          className="text-input text-input--ghost text-input--narrow"
          inputMode="numeric"
          maxLength={2}
          value={day}
          onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))}
          placeholder="DD"
        />
      </div>
      <button type="submit" className="btn btn--chrome btn--big">
        enter
      </button>
    </form>
  );
}

function OnMyMindStep({
  value,
  setValue,
  onAdvance,
}: {
  value: string;
  setValue: (s: string) => void;
  onAdvance: () => void;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onAdvance(); }}
      className="name-step__form"
    >
      <input
        className="text-input text-input--ghost"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 200))}
        placeholder="optional"
        autoFocus
        autoCapitalize="sentences"
      />
      <button type="submit" className="btn btn--chrome btn--send">
        enter
      </button>
    </form>
  );
}
