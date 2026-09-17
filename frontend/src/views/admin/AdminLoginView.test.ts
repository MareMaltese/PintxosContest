import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminLoginView from './AdminLoginView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  pushMock.mockClear();
  vi.unstubAllGlobals();
});

describe('AdminLoginView', () => {
  it('shows a validation message when submitting an empty pin', async () => {
    const wrapper = mount(AdminLoginView);
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.text()).toContain('Escribe el PIN');
  });

  it('logs in and navigates to the dashboard on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    const wrapper = mount(AdminLoginView);

    await wrapper.find('input#admin-pin').setValue('1234');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(pushMock).toHaveBeenCalledWith({ name: 'admin-dashboard' });
  });

  it('shows a retryable error on a wrong pin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    const wrapper = mount(AdminLoginView);

    await wrapper.find('input#admin-pin').setValue('0000');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('PIN incorrecto.');
    expect(pushMock).not.toHaveBeenCalled();
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
  });
});
