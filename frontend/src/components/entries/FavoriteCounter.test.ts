import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import FavoriteCounter from './FavoriteCounter.vue';
import { useVotesStore } from '../../stores/votes';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('FavoriteCounter', () => {
  it('shows 0 out of the limit before any favorite is picked', () => {
    const votes = useVotesStore();
    votes.limit = 3;
    const wrapper = mount(FavoriteCounter);
    expect(wrapper.text()).toContain('0 / 3');
  });

  it('reflects the current favorite count', () => {
    const votes = useVotesStore();
    votes.limit = 3;
    votes.favoriteIds = new Set(['e1', 'e2']);
    const wrapper = mount(FavoriteCounter);
    expect(wrapper.text()).toContain('2 / 3');
  });
});
