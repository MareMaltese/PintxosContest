import { describe, it, expect } from 'vitest';
import { computeTargetSize } from './image';

describe('computeTargetSize', () => {
  it('keeps the original size when already within the limit', () => {
    expect(computeTargetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('downscales a wide image so the largest side matches the limit', () => {
    expect(computeTargetSize(3200, 2400, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('downscales a tall image so the largest side matches the limit', () => {
    expect(computeTargetSize(1200, 4000, 1600)).toEqual({ width: 480, height: 1600 });
  });

  it('does not upscale a small image', () => {
    expect(computeTargetSize(200, 100, 1600)).toEqual({ width: 200, height: 100 });
  });

  it('treats an already-square oversized image correctly', () => {
    expect(computeTargetSize(2000, 2000, 1600)).toEqual({ width: 1600, height: 1600 });
  });
});
