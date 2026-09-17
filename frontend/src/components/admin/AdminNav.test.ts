import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminNav from './AdminNav.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { useContestStore } from '../../stores/contest';

beforeEach(() => {
  setActivePinia(createPinia());
  pushMock.mockClear();
});

describe('AdminNav', () => {
  it('navigates to each admin route by name when its button is clicked', async () => {
    useContestStore().votingMode = 'MEDALS';
    const wrapper = mount(AdminNav);
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(5);

    await buttons[0].trigger('click');
    expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-dashboard' });
    await buttons[1].trigger('click');
    expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-participants' });
    await buttons[2].trigger('click');
    expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-entries' });
    await buttons[3].trigger('click');
    expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-phases' });
    await buttons[4].trigger('click');
    expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-medal-votes' });
  });

  it('hides the Clasificación tab when votingMode is FAVORITES', () => {
    useContestStore().votingMode = 'FAVORITES';
    const wrapper = mount(AdminNav);
    expect(wrapper.findAll('button')).toHaveLength(4);
    expect(wrapper.text()).not.toContain('Clasificación');
  });
});
