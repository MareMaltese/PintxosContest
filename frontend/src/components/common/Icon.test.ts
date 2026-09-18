import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Icon from './Icon.vue';

describe('Icon', () => {
  it('renders the SVG markup for a known icon name', () => {
    const wrapper = mount(Icon, { props: { name: 'medal' } });
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('renders a different icon for a different name', () => {
    const wrapper = mount(Icon, { props: { name: 'heart' } });
    expect(wrapper.html()).toContain('<svg');
    const medalWrapper = mount(Icon, { props: { name: 'medal' } });
    expect(wrapper.html()).not.toBe(medalWrapper.html());
  });

  it('applies the size prop as width and height', () => {
    const wrapper = mount(Icon, { props: { name: 'medal', size: 32 } });
    expect(wrapper.find('.icon').attributes('style')).toContain('32px');
  });

  it('renders nothing for an unknown icon name instead of crashing', () => {
    const wrapper = mount(Icon, { props: { name: 'does-not-exist' } });
    expect(wrapper.find('svg').exists()).toBe(false);
  });

  it('renders a PNG icon as an img tag when there is no matching SVG', () => {
    const wrapper = mount(Icon, { props: { name: 'pincho', size: 24 } });
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toContain('pincho');
    expect(wrapper.find('.icon').attributes('style')).toContain('24px');
  });
});
