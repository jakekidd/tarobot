import { useEffect, useRef, useState } from 'react';
import { compile, createClaudeClient, type Profile, type Question, type Survey } from '../pipeline';
import { Spinner } from './Spinner';

type Props = {
  apiKey: string;
  survey: Survey;
  onReady: (profile: Profile, openers: Question[]) => void;
  onError: (msg: string) => void;
};

const FLAVOR_LINES = [
  'the witch is preparing.',
  'she is reading what you wrote.',
  'she is thinking.',
  'she is choosing what to ask first.',
];

export function Compiling({ apiKey, survey, onReady, onError }: Props) {
  const startedRef = useRef(false);
  const [flavorIdx, setFlavorIdx] = useState(0);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const client = createClaudeClient(apiKey);
    let cancelled = false;
    (async () => {
      try {
        const { profile, openers } = await compile(client, survey);
        if (cancelled) return;
        onReady(profile, openers);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'unknown error';
        onError(msg);
      }
    })();
    return () => { cancelled = true; };
  }, [apiKey, survey, onReady, onError]);

  useEffect(() => {
    const id = window.setInterval(
      () => setFlavorIdx((i) => (i + 1) % FLAVOR_LINES.length),
      3500,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="screen screen--compiling">
      <Spinner label={FLAVOR_LINES[flavorIdx]} />
    </div>
  );
}
