export type TurnMetrics = {
  id: string;
  speechStoppedAt?: number;
  firstTextDeltaAt?: number;
  firstAudioDeltaAt?: number;
  firstAvatarAt?: number;
  completedAt?: number;
  estimatedLipSyncOffsetMs?: number;
};

export type DerivedMetrics = TurnMetrics & {
  sttMs?: number;
  ttsFirstByteMs?: number;
  avatarMs?: number;
  endToEndMs?: number;
  fullResponseMs?: number;
};

export class MetricsTracker {
  private active: TurnMetrics | null = null;
  private history: DerivedMetrics[] = [];

  beginTurn(at = performance.now()) {
    this.active = { id: crypto.randomUUID(), speechStoppedAt: at };
  }

  markSpeechStopped(at = performance.now()) {
    this.beginTurn(at);
  }

  markFirstTextDelta(at = performance.now()) {
    if (!this.active) this.beginTurn();
    if (!this.active?.firstTextDeltaAt) this.active!.firstTextDeltaAt = at;
  }

  markFirstAudioDelta(at = performance.now()) {
    if (!this.active) this.beginTurn();
    if (!this.active?.firstAudioDeltaAt) this.active!.firstAudioDeltaAt = at;
  }

  markFirstAvatar(at = performance.now()) {
    if (!this.active) this.beginTurn();
    if (!this.active?.firstAvatarAt) this.active!.firstAvatarAt = at;
    if (this.active?.firstAudioDeltaAt) {
      this.active.estimatedLipSyncOffsetMs = at - this.active.firstAudioDeltaAt;
    }
  }

  completeTurn(at = performance.now()) {
    if (!this.active) return null;
    this.active.completedAt = at;
    const derived = this.derive(this.active);
    this.history = [...this.history.slice(-19), derived];
    this.active = null;
    return derived;
  }

  latest(): DerivedMetrics | null {
    return this.history.at(-1) ?? (this.active ? this.derive(this.active) : null);
  }

  getHistory(): DerivedMetrics[] {
    return this.history;
  }

  export() {
    return {
      exportedAt: new Date().toISOString(),
      turns: this.history,
      latest: this.latest(),
    };
  }

  private derive(turn: TurnMetrics): DerivedMetrics {
    return {
      ...turn,
      sttMs: diff(turn.speechStoppedAt, turn.firstTextDeltaAt),
      ttsFirstByteMs: diff(turn.firstTextDeltaAt, turn.firstAudioDeltaAt),
      avatarMs: diff(turn.firstAudioDeltaAt, turn.firstAvatarAt),
      endToEndMs: diff(turn.speechStoppedAt, turn.firstAvatarAt),
      fullResponseMs: diff(turn.speechStoppedAt, turn.completedAt),
    };
  }
}

function diff(start?: number, end?: number) {
  if (start == null || end == null) return undefined;
  return Math.round(end - start);
}
