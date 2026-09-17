import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AdminNav from './AdminNav.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => {
  pushMock.mockClear();
});

describe('AdminNav', () => {
  it('navigates to each admin route by name when its button is clicked', async () => {
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
});
