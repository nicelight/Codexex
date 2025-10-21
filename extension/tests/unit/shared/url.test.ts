import { describe, expect, it } from 'vitest';
import { isCodexTasksListingPath, isMainCodexListingUrl, normalizePathname } from '../../../src/shared/url';

describe('shared/url', () => {
  it('recognises legacy Codex root tasks listing path', () => {
    expect(isCodexTasksListingPath(normalizePathname('/codex'))).toBe(true);
  });

  it('rejects Codex task details route', () => {
    expect(isCodexTasksListingPath(normalizePathname('/codex/tasks'))).toBe(false);
  });

  it('rejects unrelated paths', () => {
    expect(isCodexTasksListingPath(normalizePathname('/chat'))).toBe(false);
  });

  describe('isMainCodexListingUrl', () => {
    it('accepts Codex root listing without query parameters', () => {
      expect(isMainCodexListingUrl('https://chatgpt.com/codex')).toBe(true);
    });

    it('accepts Codex listing with tab=all parameter', () => {
      expect(isMainCodexListingUrl('https://chatgpt.com/codex?tab=all')).toBe(true);
    });

    it('rejects Codex listing with other tab parameter values', () => {
      expect(isMainCodexListingUrl('https://chatgpt.com/codex?tab=queued')).toBe(false);
    });

    it('rejects alternative listing routes', () => {
      expect(isMainCodexListingUrl('https://chatgpt.com/plan')).toBe(false);
      expect(isMainCodexListingUrl('https://chatgpt.com/codex/tasks')).toBe(false);
    });

    it('accepts listings with additional query parameters', () => {
      expect(isMainCodexListingUrl('https://chatgpt.com/codex?view=active')).toBe(true);
    });
  });
});
