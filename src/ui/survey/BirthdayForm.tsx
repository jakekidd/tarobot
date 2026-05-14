// Birthday input form. Three digit-only inputs (month / day / year) with
// auto-tab on length forward and auto-tab on backspace backward. Submits
// "YYYY-MM-DD" on enter when all three are populated.

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';

type Props = {
  onSubmit: (isoDate: string) => void;
};

export function BirthdayForm({ onSubmit }: Props) {
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');

  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  function digitsOnly(s: string, max: number) {
    return s.replace(/\D/g, '').slice(0, max);
  }

  function handleMonth(e: ChangeEvent<HTMLInputElement>) {
    const v = digitsOnly(e.target.value, 2);
    setMonth(v);
    if (v.length === 2) dayRef.current?.focus();
  }

  function handleDay(e: ChangeEvent<HTMLInputElement>) {
    const v = digitsOnly(e.target.value, 2);
    setDay(v);
    if (v.length === 2) yearRef.current?.focus();
  }

  function handleYear(e: ChangeEvent<HTMLInputElement>) {
    setYear(digitsOnly(e.target.value, 4));
  }

  function handleDayKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && day.length <= 1) {
      if (day.length === 0) {
        e.preventDefault();
        monthRef.current?.focus();
      } else {
        window.setTimeout(() => monthRef.current?.focus(), 0);
      }
    }
  }

  function handleYearKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && year.length <= 1) {
      if (year.length === 0) {
        e.preventDefault();
        dayRef.current?.focus();
      } else {
        window.setTimeout(() => dayRef.current?.focus(), 0);
      }
    }
  }

  const ready = month.length >= 1 && day.length >= 1 && year.length === 4;

  return (
    <form
      className="birthday-step"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        onSubmit(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      }}
    >
      <div className="birthday-row">
        <input
          ref={monthRef}
          className="text-input text-input--ghost text-input--narrow"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={month}
          onChange={handleMonth}
          placeholder="MM"
          autoFocus
          aria-label="month"
        />
        <span className="birthday-sep">/</span>
        <input
          ref={dayRef}
          className="text-input text-input--ghost text-input--narrow"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={day}
          onChange={handleDay}
          onKeyDown={handleDayKey}
          placeholder="DD"
          aria-label="day"
        />
        <span className="birthday-sep">/</span>
        <input
          ref={yearRef}
          className="text-input text-input--ghost text-input--year"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={year}
          onChange={handleYear}
          onKeyDown={handleYearKey}
          placeholder="YYYY"
          aria-label="year"
        />
      </div>
      <button type="submit" className="btn btn--chrome btn--big" disabled={!ready}>
        enter
      </button>
    </form>
  );
}
