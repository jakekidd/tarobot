import { useEffect, useRef, useState } from 'react';

// Browser SpeechRecognition isn't in lib.dom.d.ts for some TS configs; minimal local types.
type SREvent = {
  results: ArrayLike<{
    isFinal: boolean;
    [k: number]: { transcript: string };
    length: number;
  }>;
};
type SRInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SRConstructor = new () => SRInstance;

function getSR(): SRConstructor | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SRConstructor | null;
}

export type SpeechInputState = {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
};

/**
 * Web Speech API hook. Browser-supported on Chrome/Edge/Safari (webkit prefix);
 * not on Firefox. `supported` reflects availability.
 *
 * `onFinal` fires once when the recognizer commits a final transcript.
 * `interim` updates live during recognition.
 */
export function useSpeechInput(
  onFinal: (text: string) => void,
  lang = 'en-US',
): SpeechInputState {
  const [supported] = useState(() => getSR() !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognizerRef = useRef<SRInstance | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

  function start() {
    setError(null);
    const SR = getSR();
    if (!SR) {
      setError('voice input is not supported in this browser');
      return;
    }
    const r = new SR();
    r.lang = lang;
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      let interimStr = '';
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i]!;
        const text = result[0]!.transcript;
        if (result.isFinal) {
          onFinalRef.current(text.trim());
        } else {
          interimStr += text;
        }
      }
      setInterim(interimStr);
    };
    r.onerror = (e) => {
      setError(e.error || 'voice input error');
      setListening(false);
    };
    r.onend = () => {
      setListening(false);
      setInterim('');
    };
    recognizerRef.current = r;
    r.start();
    setListening(true);
  }

  function stop() {
    recognizerRef.current?.stop();
  }

  useEffect(() => {
    return () => {
      try { recognizerRef.current?.abort(); } catch { /* ignore */ }
    };
  }, []);

  return { supported, listening, interim, error, start, stop };
}
