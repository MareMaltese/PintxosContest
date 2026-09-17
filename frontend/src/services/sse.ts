export interface ContestStreamEvent {
  type: string;
  data: Record<string, unknown>;
}

const EVENT_TYPES = ['phase-changed', 'tiebreak-round-changed', 'results-revealed', 'entries-changed'];

export function connectContestStream(onEvent: (event: ContestStreamEvent) => void): EventSource {
  const source = new EventSource('/api/contest/stream');
  for (const type of EVENT_TYPES) {
    source.addEventListener(type, (raw) => {
      try {
        const data = JSON.parse((raw as MessageEvent).data) as Record<string, unknown>;
        onEvent({ type, data });
      } catch {
        // ignora eventos con payload inválido
      }
    });
  }
  return source;
}
