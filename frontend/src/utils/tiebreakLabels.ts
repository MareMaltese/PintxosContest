export interface TiebreakRoundKindInfo {
  kind: 'MAIN' | 'MEDAL';
  targetRank: number;
}

export interface TiebreakRoundLabel {
  title: string;
  icon: string;
  color: string;
  subtitle: string;
}

const MEDAL_BY_RANK: Record<number, { name: string; color: string }> = {
  1: { name: 'Oro', color: 'var(--color-gold)' },
  2: { name: 'Plata', color: 'var(--color-silver)' },
  3: { name: 'Bronce', color: 'var(--color-bronze)' },
};

const CHOOSE_FAVORITE_SUBTITLE = 'Elige tu favorita entre las tapas empatadas:';

export function tiebreakRoundLabel(round: TiebreakRoundKindInfo): TiebreakRoundLabel {
  if (round.kind === 'MAIN') {
    return {
      title: 'Desempate del concurso',
      icon: 'heart',
      color: 'var(--color-primary)',
      subtitle: CHOOSE_FAVORITE_SUBTITLE,
    };
  }
  // The "premio al último" tiebreak reuses kind MEDAL, distinguished by its
  // targetRank always being the last place (never 1/2/3, unlike the podium).
  if (round.targetRank > 3) {
    return {
      title: 'Desempate: Cuchara de Palo',
      icon: 'skull',
      color: 'var(--color-text)',
      subtitle: 'Vota a la tapa que crees que se merece llevarse la Cuchara de Palo (el premio al último puesto):',
    };
  }
  const medal = MEDAL_BY_RANK[round.targetRank];
  return {
    title: `Desempate de medallas: ${medal.name}`,
    icon: 'medal',
    color: medal.color,
    subtitle: CHOOSE_FAVORITE_SUBTITLE,
  };
}
