import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import NavFooter from './NavFooter.vue';

const { push, back } = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
const routeMock = vi.hoisted(() => ({ name: 'gallery' as string }));
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push, back }),
}));

beforeEach(() => {
  push.mockClear();
  back.mockClear();
  routeMock.name = 'gallery';
  history.replaceState(null, '');
});

describe('NavFooter', () => {
  it('shows the center and right buttons with their labels', () => {
    const wrapper = mount(NavFooter);
    expect(wrapper.text()).toContain('TODOS LOS PINCHOS');
    expect(wrapper.text()).toContain('MIS PINCHOS');
  });

  it('navigates to the gallery when the center button is clicked', async () => {
    const wrapper = mount(NavFooter);
    await wrapper.find('.nav-footer__gallery').trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'gallery' });
  });

  it('navigates to mis pinchos when the right button is clicked', async () => {
    const wrapper = mount(NavFooter);
    await wrapper.find('.nav-footer__mine').trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'my-entries' });
  });

  it('hides the back button when there is no in-app history to go back to', () => {
    history.replaceState({ back: null }, '');
    const wrapper = mount(NavFooter);
    expect(wrapper.find('.nav-footer__back').exists()).toBe(false);
  });

  it('shows the back button and calls router.back() when there is history', async () => {
    history.replaceState({ back: '/galeria' }, '');
    const wrapper = mount(NavFooter);
    expect(wrapper.find('.nav-footer__back').exists()).toBe(true);
    expect(wrapper.text()).toContain('ATRÁS');

    await wrapper.find('.nav-footer__back').trigger('click');
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('hides the back button on the tiebreak screen even if there is history', () => {
    history.replaceState({ back: '/galeria' }, '');
    routeMock.name = 'tiebreak';
    const wrapper = mount(NavFooter);
    expect(wrapper.find('.nav-footer__back').exists()).toBe(false);
  });

  it('marks the gallery button as active on the gallery screen', () => {
    routeMock.name = 'gallery';
    const wrapper = mount(NavFooter);
    expect(wrapper.find('.nav-footer__gallery').classes()).toContain('nav-footer__button--active');
    expect(wrapper.find('.nav-footer__mine').classes()).not.toContain('nav-footer__button--active');
  });

  it('marks the mis-pinchos button as active on my-entries and edit-entry screens', () => {
    routeMock.name = 'my-entries';
    const wrapper = mount(NavFooter);
    expect(wrapper.find('.nav-footer__mine').classes()).toContain('nav-footer__button--active');
    expect(wrapper.find('.nav-footer__gallery').classes()).not.toContain('nav-footer__button--active');

    routeMock.name = 'edit-entry';
    const wrapper2 = mount(NavFooter);
    expect(wrapper2.find('.nav-footer__mine').classes()).toContain('nav-footer__button--active');
  });

  it('marks the gallery button as active on the entry-detail screen too', () => {
    routeMock.name = 'entry-detail';
    const wrapper = mount(NavFooter);
    expect(wrapper.find('.nav-footer__gallery').classes()).toContain('nav-footer__button--active');
  });
});
