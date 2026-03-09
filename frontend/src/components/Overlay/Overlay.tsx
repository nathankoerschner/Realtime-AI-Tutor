import type { DerivedMetrics } from '../../lib/metrics';

type OverlayProps = {
  visible: boolean;
  connectionState: string;
  latest: DerivedMetrics | null;
  history: DerivedMetrics[];
  onExport: () => void;
};

const fmt = (value?: number) => (value == null ? '—' : `${value}ms`);

function MetricLabel({ short, description }: { short: string; description: string }) {
  return <span title={description}>{short}</span>;
}

export function Overlay({ visible, connectionState, latest, history, onExport }: OverlayProps) {
  if (!visible) return null;

  return (
    <aside className="overlay">
      <div className="overlay-header">
        <strong>Developer Overlay</strong>
        <button onClick={onExport}>Export JSON</button>
      </div>
      <div className="overlay-grid">
        <div>State</div>
        <div>{connectionState}</div>
        <div>
          <MetricLabel short="STT" description="Speech-to-text latency: time from speech stop to first text delta." />
        </div>
        <div>{fmt(latest?.sttMs)}</div>
        <div>
          <MetricLabel short="TTS first byte" description="Time from first text delta to first audio delta." />
        </div>
        <div>{fmt(latest?.ttsFirstByteMs)}</div>
        <div>
          <MetricLabel short="Avatar" description="Time from first audio delta to first avatar render." />
        </div>
        <div>{fmt(latest?.avatarMs)}</div>
        <div>
          <MetricLabel short="First frame" description="End-to-end time from speech stop to first avatar render." />
        </div>
        <div>{fmt(latest?.endToEndMs)}</div>
        <div>
          <MetricLabel short="Total" description="Total response time from speech stop until the response is complete." />
        </div>
        <div>{fmt(latest?.fullResponseMs)}</div>
        <div>
          <MetricLabel short="Lip-sync" description="Estimated offset between first audio delta and first avatar render." />
        </div>
        <div>{fmt(latest?.estimatedLipSyncOffsetMs)}</div>
      </div>
      <div className="overlay-history">
        <strong>Recent turns</strong>
        <div className="overlay-history-header" aria-hidden="true">
          <span title="Turn identifier">Turn</span>
          <span title="End-to-end time to first avatar render">First frame</span>
          <span title="Total response time until completion">Total</span>
        </div>
        <ul>
          {history.slice().reverse().map((turn) => (
            <li key={turn.id}>
              <span>{turn.id.slice(0, 8)}</span>
              <span>{fmt(turn.endToEndMs)}</span>
              <span>{fmt(turn.fullResponseMs)}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
