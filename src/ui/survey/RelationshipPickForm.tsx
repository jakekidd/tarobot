// RelationshipPickForm — the answer widget for `relationship_pick` format.
//
// Three states:
//   1. PICK_CATEGORY — 2-column grid (family / other) + a "someone else"
//      button that expands into a scrollable sub-list. Existing cast
//      members appear as quick-pick chips above the grid.
//   2. PICK_SUBCATEGORY (only if "someone else" picked) — a scrollable
//      list of role options (boss / mentor / therapist / etc).
//   3. WHO_SPECIFICALLY — name input + pronoun toggles + gender / accent
//      color + off-limits + confirm.
//
// Smart auto-detection: if the user types a recognizable kin term
// (mom / dad / mama / papa / ...) the gender + pronouns auto-populate
// — UNLESS the user has already picked manually. Once they touch a
// control by hand, auto-detect stops overriding.

import { useEffect, useRef, useState } from 'react';
import type { CastMember } from '../../pipeline/survey';
import {
  detectKinTerm,
  randomAccent,
  type Pronouns,
} from './relationshipHelpers';

type FamilyCategory =
  | 'parent' | 'sibling' | 'child'
  | 'partner' | 'friend';

type SomeoneElseSubcat =
  | 'ex' | 'cousin' | 'best friend' | 'childhood friend'
  | 'boss' | 'colleague' | 'mentor' | 'therapist' | 'teacher'
  | 'coach' | 'neighbor' | 'roommate' | 'in-law' | 'stepparent'
  | 'group chat friend' | 'online friend' | 'someone i used to know';

type PickedCategory = FamilyCategory | SomeoneElseSubcat | 'existing';

type Props = {
  cast: CastMember[];
  onSubmit: (encoded: string) => void;
  /** Fires with the live typed name + the color it should render in
   *  whenever the user is on the "who specifically?" screen with a
   *  name partial. Survey lifts this into the mascot's dialogue box
   *  so the line `i'm sensing... a [NAME]` appears voiced from the
   *  turtle, not from a form-internal preview. Fires null when the
   *  user isn't on the who screen or the input is empty. */
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
];
// Sub-list ordered by likely relational charge: ex / cousin / friend variants
// first (these were lifted from the main grid per user feedback), then the
// broader social roles. The scrollable container makes the list length
// inexpensive — anything that's genuinely a recognized role can go here.
const SOMEONE_ELSE: SomeoneElseSubcat[] = [
  'ex', 'cousin', 'best friend', 'childhood friend',
  'boss', 'colleague', 'mentor', 'therapist', 'teacher', 'coach',
  'neighbor', 'roommate', 'in-law', 'stepparent',
  'group chat friend', 'online friend', 'someone i used to know',
];

export function RelationshipPickForm({ cast, onSubmit, onSensingChange }: Props) {
  const [mode, setMode] = useState<'category' | 'someone-else' | 'who'>('category');
  const [picked, setPicked] = useState<PickedCategory | null>(null);
  const [name, setName] = useState('');
  const [pronouns, setPronouns] = useState<Pronouns | null>(null);
  const [pronounsTouched, setPronounsTouched] = useState(false);
  const [accent, setAccent] = useState<string>(() => randomAccent());
  const [offLimits, setOffLimits] = useState(false);
  const accentInitialRef = useRef(false);

  // Reseed the accent once when the user lands on the "who" screen — gives
  // them a fresh hue per person. After that, only the dice changes it.
  useEffect(() => {
    if (mode === 'who' && !accentInitialRef.current) {
      accentInitialRef.current = true;
      setAccent(randomAccent());
    }
    if (mode !== 'who') {
      accentInitialRef.current = false;
    }
  }, [mode]);

  // Smart auto-detection from kin terms — applied inline on input change
  // so it doesn't run as a setState-in-effect. Only fires when the user
  // hasn't explicitly toggled the pronouns. Detection now suggests
  // pronouns only — color is dice-driven (purple + turquoise are
  // reserved for the user and the seer, so they can't be relation
  // accents anymore).
  function handleNameChange(next: string) {
    setName(next);
    const detected = detectKinTerm(next);
    if (!detected) return;
    if (!pronounsTouched) setPronouns(detected);
  }

  // Publish sensing state to the parent (so it can render the live
  // "i'm sensing... a [NAME]" line in the mascot's dialogue box).
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

  function pickSubcategory(c: SomeoneElseSubcat) {
    setPicked(c);
    setMode('who');
  }

  function backToCategory() {
    setMode('category');
    setPicked(null);
    setName('');
    setPronouns(null);
    setPronounsTouched(false);
    setOffLimits(false);
  }

  function setPronounObjective(o: 'him' | 'them' | 'her') {
    // Derive subjective from objective (him → he, her → she, them → they).
    // We only collect objective from the user — keeps the row to one set
    // of buttons. The subjective slot is still on the CastMember for
    // downstream voice rendering ("he handled it" vs "she handled it").
    setPronounsTouched(true);
    setPronouns({ subjective: defaultSubjective(o), objective: o });
  }

  function rerollAccent() {
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
          <div className="rel-pick__details-head">
            <span className="rel-pick__details-category">{picked}</span>
            <button
              type="button"
              className="rel-pick__details-back"
              onClick={backToCategory}
            >
              ← change
            </button>
          </div>

          <input
            className="text-input text-input--ghost rel-pick__name-input"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={namePlaceholder(picked)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />

          {/* "i'm sensing... a [NAME]" is rendered upstream in the
              mascot's dialogue box (Survey.tsx subscribes via
              onSensingChange) so the cat appears to voice the guess
              rather than the form previewing it inline. */}

          <div className="rel-pick__row">
            <span className="rel-pick__row-label">pronouns</span>
            <div className="rel-pick__pronoun-group">
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

          <div className="rel-pick__row">
            <span className="rel-pick__row-label">color</span>
            <div className="rel-pick__gender-group">
              {/* Current accent (preview) + dice to reroll. The 3
                  gender-dot quick-picks were removed: purple is
                  reserved for the user's own name, turquoise for the
                  seer's first-person — so they can't be relation
                  colors. Random palette excludes both hue bands. */}
              <span
                className="rel-pick__accent-preview"
                style={{ background: accent }}
                aria-label="current name color"
              />
              <button
                type="button"
                className="rel-pick__dice"
                onClick={rerollAccent}
                aria-label="roll a random color"
                title="reroll the color"
              >
                ⚀
              </button>
            </div>
          </div>

          <label className="rel-pick__off-limits">
            <input
              type="checkbox"
              checked={offLimits}
              onChange={(e) => setOffLimits(e.target.checked)}
            />
            <span>off-limits — don't ask me about them later</span>
          </label>

          <button
            type="submit"
            className="btn btn--primary btn--menu rel-pick__commit"
            disabled={!name.trim()}
          >
            confirm
          </button>
        </form>
      )}
    </div>
  );
}

function namePlaceholder(c: PickedCategory): string {
  if (c === 'parent') return 'mom, dad, …';
  if (c === 'sibling') return 'their name, or "sis" / "bro"';
  if (c === 'ex' || c === 'partner') return 'their name';
  if (c === 'someone i used to know') return 'their name (or just a tag)';
  return 'their name';
}

function defaultSubjective(o: 'him' | 'them' | 'her'): 'he' | 'they' | 'she' {
  if (o === 'him') return 'he';
  if (o === 'her') return 'she';
  return 'they';
}

