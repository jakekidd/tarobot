// Bench input — DateEntry.
// Native date picker. The opener accepts YYYY-MM-DD strings; the
// engine's parseBirthDate handles the parse + validation downstream.

import { useState, type FormEvent } from 'react';
import { Button } from '../lib';

type Props = {
  onSubmit: (iso: string) => void;
};

export function DateEntry({ onSubmit }: Props) {
  const [date, setDate] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!date) return;
    onSubmit(date);
  }

  return (
    <form className="bench__stack bench__stack--gap-2" onSubmit={handleSubmit}>
      <input
        type="date"
        className="bench__input"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        autoFocus
      />
      <div className="bench__row bench__row--gap-2 bench__row--end">
        <Button type="submit" variant="primary" disabled={!date}>submit</Button>
      </div>
    </form>
  );
}
