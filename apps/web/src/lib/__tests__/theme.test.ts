// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME,
  getStoredTheme,
  isTheme,
  STORAGE_KEY,
  storeTheme,
  THEME_INIT_SCRIPT,
} from '../theme';

describe('isTheme', () => {
  it('accepts valid theme values', () => {
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('light')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isTheme('auto')).toBe(false);
    expect(isTheme('')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(42)).toBe(false);
  });
});

describe('DEFAULT_THEME', () => {
  it('is dark', () => {
    expect(DEFAULT_THEME).toBe('dark');
  });
});

describe('STORAGE_KEY', () => {
  it('is signal.theme', () => {
    expect(STORAGE_KEY).toBe('signal.theme');
  });
});

describe('getStoredTheme / storeTheme', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(getStoredTheme()).toBeNull();
  });

  it('round-trips a valid theme', () => {
    storeTheme('light');
    expect(getStoredTheme()).toBe('light');

    storeTheme('dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('returns null for a corrupt stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'neon');
    expect(getStoredTheme()).toBeNull();
  });

  it('returns null when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(getStoredTheme()).toBeNull();
    vi.restoreAllMocks();
  });
});

describe('THEME_INIT_SCRIPT', () => {
  it('references the correct storage key', () => {
    expect(THEME_INIT_SCRIPT).toContain(STORAGE_KEY);
  });

  it('sets data-theme only for light', () => {
    expect(THEME_INIT_SCRIPT).toContain('==="light"');
    expect(THEME_INIT_SCRIPT).toContain('dataset.theme="light"');
  });
});
