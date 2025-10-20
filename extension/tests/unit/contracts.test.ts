import { describe, expect, it, beforeEach } from 'vitest';

import {
  assertAggregatedTabsState,
  assertContentScriptTasksUpdate,
  assertPopupRenderState,
  ContractValidationError,
  contractRegistry,
  resetContractValidationState,
  validateCodexTasksUserSettings,
} from '@/shared/contracts';

const validSignal = {
  detector: 'D1_SPINNER',
  evidence: '#task-spinner',
} as const;

describe('contracts validation helpers', () => {
  beforeEach(() => {
    resetContractValidationState();
  });

  it('validates content script task updates', () => {
    const payload = {
      type: 'TASKS_UPDATE',
      origin: 'https://chat.openai.com',
      active: true,
      count: 2,
      signals: [validSignal],
      ts: Date.now(),
    };

    expect(() => assertContentScriptTasksUpdate(payload)).not.toThrow();
  });

  it('rejects invalid content script task updates', () => {
    const payload = {
      type: 'TASKS_UPDATE',
      origin: 'not-a-uri',
      active: true,
      count: -1,
      signals: [],
      ts: Date.now(),
    };

    expect(() => assertContentScriptTasksUpdate(payload)).toThrow(ContractValidationError);
  });

  it('validates aggregated state and popup descriptors', () => {
    const aggregatedState = {
      tabs: {
        '42': {
          origin: 'https://chat.openai.com',
          title: 'Codex Tab',
          count: 1,
          active: true,
          updatedAt: Date.now(),
          lastSeenAt: Date.now(),
          heartbeat: {
            lastReceivedAt: Date.now(),
            expectedIntervalMs: 5000,
            status: 'OK',
            missedCount: 0,
          },
          signals: [validSignal],
        },
      },
      lastTotal: 1,
      debounce: {
        ms: 12000,
        since: 0,
      },
    };

    expect(() => assertAggregatedTabsState(aggregatedState)).not.toThrow();

    const popupState = {
      generatedAt: new Date().toISOString(),
      totalActive: 1,
      tabs: [
        {
          tabId: 42,
          title: 'Codex Tab',
          origin: 'https://chat.openai.com',
          count: 1,
          lastSeenAt: Date.now(),
          heartbeatStatus: 'OK',
          signals: [validSignal],
        },
      ],
      locale: 'en' as const,
      messages: {
        idle: 'No active tasks',
      },
    };

    expect(() => assertPopupRenderState(popupState)).not.toThrow();
  });

  it('keeps registry descriptors consistent', () => {
    const descriptor = contractRegistry.ContentScriptTasksUpdate;
    expect(descriptor.schema).toBeDefined();
    expect(descriptor.validate).toBeTypeOf('function');
    expect(descriptor.assert).toBeTypeOf('function');
  });

  it('accepts empty user settings but rejects invalid numbers', () => {
    expect(validateCodexTasksUserSettings({})).toBe(true);
    expect(validateCodexTasksUserSettings({ debounceMs: 1000 })).toBe(true);
    expect(validateCodexTasksUserSettings({ debounceMs: -5 })).toBe(false);
  });
});
