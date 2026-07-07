// The inspector — the exact assembled request and response for any model
// call. The single most important lab feature: what did the model
// actually see.

import { Button, Kv, Pill, Stack } from '../lib';
import type { CallRecord } from '../../pipeline/ensemble';

type Props = {
  call: CallRecord;
  onClose: () => void;
};

export function Inspector({ call, onClose }: Props) {
  const ms = call.endedAt !== undefined ? call.endedAt - call.startedAt : null;
  return (
    <div className="xray__modal-backdrop" onClick={onClose}>
      <div className="xray__modal" onClick={(e) => e.stopPropagation()}>
        <Stack gap={3}>
          <Kv
            rows={[
              { key: 'agent', value: <Pill variant="accent">{call.agent}</Pill> },
              { key: 'tier', value: call.tier },
              {
                key: 'status',
                value: call.error ? (
                  <Pill variant="hot">error</Pill>
                ) : call.endedAt !== undefined ? (
                  <Pill variant="good">done</Pill>
                ) : (
                  <Pill variant="warm">in flight</Pill>
                ),
              },
              { key: 'latency', value: ms !== null ? `${ms}ms` : '—' },
            ]}
          />
          <div>
            <div className="bench__section-title">system</div>
            <pre className="xray__pre">{call.system}</pre>
          </div>
          <div>
            <div className="bench__section-title">user (the assembled context)</div>
            <pre className="xray__pre">{call.user}</pre>
          </div>
          {call.streamed && (
            <div>
              <div className="bench__section-title">streamed output</div>
              <pre className="xray__pre">{call.streamed}</pre>
            </div>
          )}
          {call.output !== undefined && (
            <div>
              <div className="bench__section-title">parsed output</div>
              <pre className="xray__pre">
                {typeof call.output === 'string'
                  ? call.output
                  : JSON.stringify(call.output, null, 2)}
              </pre>
            </div>
          )}
          {call.error && (
            <div>
              <div className="bench__section-title">error</div>
              <pre className="xray__pre">{call.error}</pre>
            </div>
          )}
          <Button onClick={onClose} variant="ghost">
            close
          </Button>
        </Stack>
      </div>
    </div>
  );
}
