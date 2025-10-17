import { describe, expect, it } from 'vitest';
import { isCodexTasksListingPath, normalizePathname } from '../../../src/shared/url';

describe('shared/url', () => {
  it('recognises legacy Codex tasks listing path', () => {
    expect(isCodexTasksListingPath(normalizePathname('/codex'))).toBe(true);
  });

  it('recognises new plan tasks listing path', () => {
    expect(isCodexTasksListingPath(normalizePathname('/plan'))).toBe(true);
  });

  it('rejects unrelated paths', () => {
    expect(isCodexTasksListingPath(normalizePathname('/chat'))).toBe(false);
  });
});
