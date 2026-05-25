// RelationshipPickForm — the answer widget for `relationship_pick` format.
//
// Three states:
//   1. PICK_CATEGORY — 2-column grid (family / other) + a "someone else"
//      button that expands into a scrollable sub-list. Existing cast
//      members appear as quick-pick chips above the grid.
//   2. PICK_SUBCATEGORY (only if "someone else" picked) — a scrollable
//      list of role options (boss / mentor / therapist / etc).
//   3. WHO_SPECIFICALLY — name input flanked by [color][input][dice].
//      Pronouns sit unlabeled in the top-right (same row as category).
//      ← CHANGE / CONFIRM as twin bottom buttons.
//
// Behaviors on the WHO screen:
//   - Color square click → reroll just the color.
//   - Dice square click  → reroll name (from gender-matched bank) AND
//                          color. Does NOT mark name as autofilled.
//   - Pronouns click → for parent + HIM/HER, IF input is empty or
//                      previously autofilled, sets name to dad/mom and
//                      marks isAutofilled=true.
//   - Input focus when isAutofilled → clear input + isAutofilled=false
//                      (DEX behavior — tapping to edit means start
//                      fresh).
//   - Typing → clears isAutofilled. Kin-term auto-detection still
//     suggests pronouns inline.
//
// Placeholder shows two random names from the bank (one masc + one fem)
// picked once on entry to the WHO screen; for parent / sibling, kin
// shorthand prefixes them ("mom, dad, Atlas, Iris, …").

import { useEffect, useRef, useState } from 'react';
import type { CastMember } from '../../pipeline/survey';
import {
  detectKinTerm,
  randomAccent,
  type Pronouns,
} from './relationshipHelpers';
import { randomName, MASC_NAMES, FEM_NAMES } from './nameBanks';
import { DiceIcon } from '../icons/DiceIcon';

type FamilyCategory =
  | 'self'
  | 'parent' | 'sibling' | 'child'
  | 'partner' | 'friend' | 'boss';

type SomeoneElseSubcat =
  | 'ex' | 'cousin' | 'best friend' | 'childhood friend'
  | 'colleague' | 'mentor' | 'therapist' | 'teacher'
  | 'coach' | 'neighbor' | 'roommate' | 'in-law' | 'stepparent'
  | 'group chat friend' | 'online friend' | 'someone i used to know';

type PickedCategory = FamilyCategory | SomeoneElseSubcat | 'existing';

type Props = {
  cast: CastMember[];
  /** The current user's first name. Used for the "ME" pick — when the
   *  user nominates themselves as the center of their life, we submit
   *  with their own name so the answer is self-referential. */
  selfName: string;
  onSubmit: (encoded: string) => void;
  onSensingChange?: (state: { name: string; color: string } | null) => void;
};

const FAMILY: { id: FamilyCategory; label: string }[] = [
  { id: 'parent',  label: 'parent or caretaker' },
  { id: 'sibling', label: 'sibling' },
  { id: 'child',   label: 'child' },
];
const OTHER: { id: FamilyCategory; label: string }[] = [
  { id: 'partner', label: 'partner' },
  { id: 'friend',  label: 'friend' },
  { id: 'boss',    label: 'boss' },
];
const SOMEONE_ELSE: SomeoneElseSubcat[] = [
  'ex', 'cousin', 'best friend', 'childhood friend',
  'colleague', 'mentor', 'therapist', 'teacher', 'coach',
  'neighbor', 'roommate', 'in-law', 'stepparent',
  'group chat friend', 'online friend', 'someone i used to know',
];

/** Pick a fresh pair (one masc + one fem) for the placeholder suggestions
 *  every time the WHO screen mounts. The names rotate per question so
 *  the user sees variety. */
function pickSuggestionPair(): { a: string; b: string } {
  const a = MASC_NAMES[Math.floor(Math.random() * MASC_NAMES.length)]!;
  const b = FEM_NAMES[Math.floor(Math.random() * FEM_NAMES.length)]!;
  return { a, b };
}

export function RelationshipPickForm({ cast, selfName, onSubmit, onSensingChange }: Props) {
  const [mode, setMode] = useState<'category' | 'someone-else' | 'who'>('category');
  const [picked, setPicked] = useState<PickedCategory | null>(null);
  const [name, setName] = useState('');
  const [isAutofilled, setIsAutofilled] = useState(false);
  const [pronouns, setPronouns] = useState<Pronouns | null>(null);
  const [pronounsTouched, setPronounsTouched] = useState(false);
  const [accent, setAccent] = useState<string>(() => randomAccent());
  const [offLimits, setOffLimits] = useState(false);
  const accentInitialRef = useRef(false);
  const [suggestionPair, setSuggestionPair] = useState<{ a: string; b: string }>(
    () => pickSuggestionPair(),
  );

  // Reseed both accent + suggestion-pair once when the user lands on
  // the WHO screen. Fresh hue + fresh names per person.
  useEffect(() => {
    if (mode === 'who' && !accentInitialRef.current) {
      accentInitialRef.current = true;
      setAccent(randomAccent());
      setSuggestionPair(pickSuggestionPair());
    }
    if (mode !== 'who') {
      accentInitialRef.current = false;
    }
  }, [mode]);

  // Inline kin-term detection (mom / dad / mama / papa …) suggests
  // pronouns when user types. Color is dice-only.
  function handleNameChange(next: string) {
    setName(next);
    setIsAutofilled(false);
    const detected = detectKinTerm(next);
    if (!detected) return;
    if (!pronounsTouched) setPronouns(detected);
  }

  // DEX-style clear: tapping the input clears autofilled content so the
  // user can immediately type their own value. Manually-typed content
  // never triggers this — only the kin-term-default autofill.
  function handleInputFocus() {
    if (isAutofilled) {
      setName('');
      setIsAutofilled(false);
    }
  }

  // Publish sensing state to the parent (mascot dialogue line).
  useEffect(() => {
    if (!onSensingChange) return;
    if (mode === 'who' && name.trim().length > 0) {
      onSensingChange({ name: name.trim(), color: accent });
    } else {
      onSensingChange(null);
    }
    return () => { onSensingChange(null); };
  }, [mode, name, accent, onSensingChange]);

  function pickExisting(member: CastMember) {
    onSubmit(JSON.stringify({
      category: 'existing',
      name: member.label,
      off_limits: !!member.off_limits,
      pronouns: member.pronouns,
      color: member.color,
    }));
  }

  function pickCategory(c: FamilyCategory) {
    setPicked(c);
    setMode('who');
  }

  /** "ME" pick — user nominates themselves as the center of their life.
   *  Skips the WHO screen since we already know their name. Engine
   *  treats category='self' as a no-cast-upsert (the user isn't a
   *  separate cast member to track), but the answer is recorded. */
  function pickSelf() {
    onSubmit(JSON.stringify({
      category: 'self',
      name: selfName,
    }));
  }

  function pickSubcategory(c: SomeoneElseSubcat) {
    setPicked(c);
    setMode('who');
  }

  function backToCategory() {
    setMode('category');
    setPicked(null);
    setName('');
    setIsAutofilled(false);
    setPronouns(null);
    setPronounsTouched(false);
    setOffLimits(false);
  }

  // Pronoun pick. ALSO triggers kin-term autofill for parent + him/her
  // when input is empty or was previously autofilled.
  function setPronounObjective(o: 'him' | 'them' | 'her') {
    setPronounsTouched(true);
    setPronouns({ subjective: defaultSubjective(o), objective: o });

    // Kin-term autofill — parent category only, him/her only.
    if (picked === 'parent' && (o === 'him' || o === 'her')) {
      if (name.trim().length === 0 || isAutofilled) {
        setName(o === 'him' ? 'dad' : 'mom');
        setIsAutofilled(true);
      }
    }
  }

  function rerollColor() {
    setAccent((prev) => randomAccent(prev));
  }

  function rollDice() {
    // Roll name from the gender-matched bank (combined if no pronoun
    // picked yet). Dice is an EXPLICIT user choice → not isAutofilled.
    const nextName = randomName(pronouns?.objective ?? null, name);
    setName(nextName);
    setIsAutofilled(false);
    setAccent((prev) => randomAccent(prev));
  }

  function submit() {
    const cleaned = name.trim();
    if (!cleaned) return;
    onSubmit(JSON.stringify({
      category: picked,
      name: cleaned,
      off_limits: offLimits,
      pronouns: pronouns ?? undefined,
      color: accent,
    }));
  }

  // Compose the placeholder: kin shorthand (if applicable) + two
  // random names + ellipsis. Names are stable across renders within
  // a WHO visit (lifetime-scoped via state).
  const placeholder = composePlaceholder(picked, suggestionPair);

  return (
    <div className="rel-pick">
      {mode === 'category' && (
        <>
          {cast.length > 0 && (
            <div className="rel-pick__chips" aria-label="known people">
              {cast.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  className={`rel-pick__chip ${m.off_limits ? 'rel-pick__chip--off-limits' : ''}`}
                  onClick={() => pickExisting(m)}
                  style={m.color ? { borderColor: m.color, color: m.color } : undefined}
                  title={m.off_limits ? 'off-limits — picked anyway' : `pick ${m.label}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="rel-pick__self"
            onClick={pickSelf}
          >
            me
          </button>

          <div className="rel-pick__grid">
            <ul className="rel-pick__column">
              {FAMILY.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="rel-pick__category"
                    onClick={() => pickCategory(c.id)}
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
            <ul className="rel-pick__column">
              {OTHER.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="rel-pick__category"
                    onClick={() => pickCategory(c.id)}
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            className="rel-pick__someone-else"
            onClick={() => setMode('someone-else')}
          >
            someone else  ↓
          </button>
        </>
      )}

      {mode === 'someone-else' && (
        <>
          <div className="rel-pick__sub-head">
            <span>someone else — pick a role</span>
            <button
              type="button"
              className="rel-pick__details-back"
              onClick={() => setMode('category')}
            >
              ← back
            </button>
          </div>
          <div className="rel-pick__sub-scroll" aria-label="scrollable roles">
            <ul className="rel-pick__sub-list">
              {SOMEONE_ELSE.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    className="rel-pick__sub-item"
                    onClick={() => pickSubcategory(c)}
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>
            <div className="rel-pick__scroll-hint">scroll ↓</div>
          </div>
        </>
      )}

      {mode === 'who' && picked && (
        <form
          className="rel-pick__details"
          onSubmit={(e) => { e.preventDefault(); submit(); }}
        >
          {/* TOP ROW: category label left · pronouns right (unlabeled, bigger) */}
          <div className="rel-pick__top-row">
            <span className="rel-pick__details-category">{picked}</span>
            <div className="rel-pick__pronoun-group rel-pick__pronoun-group--big">
              {(['him', 'them', 'her'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`rel-pick__pronoun ${pronouns?.objective === o ? 'rel-pick__pronoun--on' : ''}`}
                  onClick={() => setPronounObjective(o)}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          {/* INPUT ROW: color square (clickable) · name input · dice square */}
          <div className="rel-pick__input-row">
            <button
              type="button"
              className="rel-pick__color-square"
              style={{ background: accent }}
              onClick={rerollColor}
              aria-label="reroll name color"
              title="click to reroll the color"
            />
            <input
              className="rel-pick__name-input"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={handleInputFocus}
              placeholder={placeholder}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="rel-pick__dice-square"
              onClick={rollDice}
              aria-label="roll a random name and color"
              title="roll a random name and color"
            >
              <DiceIcon size="1.4rem" />
            </button>
          </div>

          <label className="rel-pick__off-limits">
            <input
              type="checkbox"
              checked={offLimits}
              onChange={(e) => setOffLimits(e.target.checked)}
            />
            <span>off-limits — don't ask me about them later</span>
          </label>

          {/* BOTTOM ROW: ← CHANGE (ghost, left) · CONFIRM (filled, right) */}
          <div className="rel-pick__bottom-row">
            <button
              type="button"
              className="btn btn--ghost btn--menu rel-pick__change-btn"
              onClick={backToCategory}
            >
              ← CHANGE
            </button>
            <button
              type="submit"
              className="btn btn--primary btn--menu rel-pick__commit"
              disabled={!name.trim()}
            >
              CONFIRM
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function composePlaceholder(
  picked: PickedCategory | null,
  pair: { a: string; b: string },
): string {
  if (picked === 'parent') return `mom, dad, ${pair.a}, ${pair.b}, …`;
  if (picked === 'sibling') return `sis, bro, ${pair.a}, ${pair.b}, …`;
  if (picked === 'someone i used to know') return `${pair.a}, ${pair.b}, or just a tag, …`;
  return `${pair.a}, ${pair.b}, …`;
}

function defaultSubjective(o: 'him' | 'them' | 'her'): 'he' | 'they' | 'she' {
  if (o === 'him') return 'he';
  if (o === 'her') return 'she';
  return 'they';
}
