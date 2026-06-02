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
    // Clamp at 12. Typing "19" snaps to "12" and advances.
    let clamped = v;
    if (v.length > 0 && Number(v) > 12) clamped = '12';
    setMonth(clamped);
    // Re-clamp the day if the new month allows fewer days than the
    // current day value (e.g. user types month=02 with day=31).
    if (clamped.length > 0 && day.length > 0) {
      const max = daysInMonth(Number(clamped), year ? Number(year) : null);
      if (Number(day) > max) setDay(max.toString());
    }
    if (clamped.length === 2 || (v.length === 2 && Number(v) > 12)) {
      dayRef.current?.focus();
    }
  }

  function handleDay(e: ChangeEvent<HTMLInputElement>) {
    const v = digitsOnly(e.target.value, 2);
    // Clamp by days-in-month if we know the month. If month is empty
    // yet, allow up to 31 (max across all months) — month edit will
    // re-clamp later.
    const max = month.length > 0
      ? daysInMonth(Number(month), year ? Number(year) : null)
      : 31;
    let clamped = v;
    if (v.length > 0 && Number(v) > max) clamped = max.toString();
    setDay(clamped);
    if (clamped.length === 2 || (v.length === 2 && Number(v) > max)) {
      yearRef.current?.focus();
    }
  }

  function handleYear(e: ChangeEvent<HTMLInputElement>) {
    const next = digitsOnly(e.target.value, 4);
    setYear(next);
    // Feb 29 → 28 if the new year isn't a leap year.
    if (month.length > 0 && day.length > 0 && next.length === 4) {
      const max = daysInMonth(Number(month), Number(next));
      if (Number(day) > max) setDay(max.toString());
    }
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

/** Days in a given month, accounting for leap years when month=2.
 *  Year null → assume non-leap (max 28 for Feb). */
function daysInMonth(month: number, year: number | null): number {
  if (month === 2) {
    if (year === null) return 28;
    const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return isLeap ? 29 : 28;
  }
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 31;
}
