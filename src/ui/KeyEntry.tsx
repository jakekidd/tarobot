import { useState } from 'react';
import { createClaudeClient, validateKey } from '../pipeline';
import { saveApiKey } from '../storage';

type Props = {
  onValidated: (key: string) => void;
};

export function KeyEntry({ onValidated }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    if (!value.trim().startsWith('sk-ant-')) {
      setErr('that key does not look right. it should start with sk-ant-…');
      return;
    }
    setBusy(true);
    try {
      const client = createClaudeClient(value);
      await validateKey(client);
      saveApiKey(value);
      onValidated(value.trim());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setErr(`the cards do not recognize this key.\n${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen screen--key">
      <h2 className="screen__title">offer a key</h2>
      <p className="screen__lede">
        tarobot needs a way to speak. paste your anthropic api key.
        it never leaves this device.
      </p>
      <form onSubmit={submit} className="key-form">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          placeholder="sk-ant-..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="key-form__input"
          disabled={busy}
        />
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'consulting…' : 'continue'}
        </button>
      </form>
      {err && <pre className="screen__error">{err}</pre>}
      <p className="screen__fine">
        get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
        stored in this browser only.
      </p>
    </div>
  );
}
