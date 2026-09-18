import { describe, it, expect } from 'vitest';
import { tiebreakRoundLabel } from './tiebreakLabels';

describe('tiebreakRoundLabel', () => {
  it('labels a MAIN (favorites) round with a heart icon', () => {
    expect(tiebreakRoundLabel({ kind: 'MAIN', targetRank: 1 })).toEqual({
      title: 'Desempate del concurso',
      icon: 'heart',
      color: 'var(--color-primary)',
    });
  });

  it('names the specific medal for each podium rank', () => {
    expect(tiebreakRoundLabel({ kind: 'MEDAL', targetRank: 1 })).toEqual({
      title: 'Desempate de medallas: Oro',
      icon: 'medal',
      color: 'var(--color-gold)',
    });
    expect(tiebreakRoundLabel({ kind: 'MEDAL', targetRank: 2 })).toEqual({
      title: 'Desempate de medallas: Plata',
      icon: 'medal',
      color: 'var(--color-silver)',
    });
    expect(tiebreakRoundLabel({ kind: 'MEDAL', targetRank: 3 })).toEqual({
      title: 'Desempate de medallas: Bronce',
      icon: 'medal',
      color: 'var(--color-bronze)',
    });
  });

  it('labels a worst-prize round (targetRank past the podium) with a spoon icon', () => {
    expect(tiebreakRoundLabel({ kind: 'MEDAL', targetRank: 7 })).toEqual({
      title: 'Desempate: premio al último',
      icon: 'spoon',
      color: 'var(--color-text)',
    });
  });
});
