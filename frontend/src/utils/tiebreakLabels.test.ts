import { describe, it, expect } from 'vitest';
import { tiebreakRoundLabel } from './tiebreakLabels';

describe('tiebreakRoundLabel', () => {
  it('labels a MAIN (favorites) round with a heart icon', () => {
    expect(tiebreakRoundLabel({ kind: 'MAIN', targetRank: 1 })).toEqual({
      title: 'Desempate del concurso',
      icon: 'heart',
      color: 'var(--color-primary)',
      subtitle: 'Elige tu favorita entre las tapas empatadas:',
    });
  });

  it('names the specific medal for each podium rank', () => {
    expect(tiebreakRoundLabel({ kind: 'MEDAL', targetRank: 1 })).toEqual({
      title: 'Desempate de medallas: Oro',
      icon: 'medal',
      color: 'var(--color-gold)',
      subtitle: 'Elige tu favorita entre las tapas empatadas:',
    });
    expect(tiebreakRoundLabel({ kind: 'MEDAL', targetRank: 2 })).toEqual({
      title: 'Desempate de medallas: Plata',
      icon: 'medal',
      color: 'var(--color-silver)',
      subtitle: 'Elige tu favorita entre las tapas empatadas:',
    });
    expect(tiebreakRoundLabel({ kind: 'MEDAL', targetRank: 3 })).toEqual({
      title: 'Desempate de medallas: Bronce',
      icon: 'medal',
      color: 'var(--color-bronze)',
      subtitle: 'Elige tu favorita entre las tapas empatadas:',
    });
  });

  it('labels a worst-prize round (targetRank past the podium) with a skull icon and clarifies who should win it', () => {
    expect(tiebreakRoundLabel({ kind: 'MEDAL', targetRank: 7 })).toEqual({
      title: 'Desempate: Cuchara de Palo',
      icon: 'skull',
      color: 'var(--color-text)',
      subtitle: 'Vota a la tapa que crees que se merece llevarse la Cuchara de Palo (el premio al último puesto):',
    });
  });
});
