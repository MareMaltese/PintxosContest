export interface TiebreakRoundKindInfo {
  kind: 'MAIN' | 'MEDAL';
  targetRank: number;
}

export function tiebreakRoundLabel(round: TiebreakRoundKindInfo): { title: string; icon: string } {
  if (round.kind === 'MAIN') return { title: 'Desempate del concurso', icon: 'heart' };
  // The "premio al último" tiebreak reuses kind MEDAL, distinguished by its
  // targetRank always being the last place (never 1/2/3, unlike the podium).
  return round.targetRank <= 3
    ? { title: 'Desempate de medallas', icon: 'medal' }
    : { title: 'Desempate: premio al último', icon: 'skull' };
}
