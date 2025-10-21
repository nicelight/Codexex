import { describe, expect, it } from 'vitest';
import {
  isCodexTasksListingPath,
  isMainCodexListingUrl,
  normalizePathname,
  resolveMainCodexListingTab,
} from '../../../src/shared/url';

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

    it('accepts Codex listing with tab=code_reviews parameter', () => {
      expect(isMainCodexListingUrl('https://chatgpt.com/codex?tab=code_reviews')).toBe(true);
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

  describe('resolveMainCodexListingTab', () => {
    it('defaults to "all" when tab parameter is absent', () => {
      expect(resolveMainCodexListingTab('https://chatgpt.com/codex')).toBe('all');
    });

    it('returns "all" for explicit tab parameter', () => {
      expect(resolveMainCodexListingTab('https://chatgpt.com/codex?tab=all')).toBe('all');
    });

    it('returns "code_reviews" for code review tab', () => {
      expect(resolveMainCodexListingTab('https://chatgpt.com/codex?tab=code_reviews')).toBe(
        'code_reviews',
      );
    });

    it('rejects unsupported tab parameter values', () => {
      expect(resolveMainCodexListingTab('https://chatgpt.com/codex?tab=queued')).toBeUndefined();
    });
  });
});
