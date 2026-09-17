import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import HasEntryQuestionView from './HasEntryQuestionView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => {
  pushMock.mockClear();
});

describe('HasEntryQuestionView', () => {
  it('shows the question and both options', () => {
    const wrapper = mount(HasEntryQuestionView);
    expect(wrapper.text()).toContain('¿Has traído algún pincho?');
    expect(wrapper.text()).toContain('Sí, quiero registrar mi pincho');
    expect(wrapper.text()).toContain('No, solo vengo a comer');
  });

  it('navigates to new-entry when answering yes', async () => {
    const wrapper = mount(HasEntryQuestionView);
    await wrapper.findAll('button')[0].trigger('click');
    expect(pushMock).toHaveBeenCalledWith({ name: 'new-entry' });
  });

  it('navigates to the gallery when answering no', async () => {
    const wrapper = mount(HasEntryQuestionView);
    await wrapper.findAll('button')[1].trigger('click');
    expect(pushMock).toHaveBeenCalledWith({ name: 'gallery' });
  });
});
