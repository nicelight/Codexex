/* eslint-disable */
/**
 * Автогенерируемый модуль. Не редактируйте вручную.
 * Скрипт генерации: scripts/generate-contracts.mjs
 */

import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

export interface ContractDescriptor<T> {
  readonly schema: unknown;
  readonly validate: (value: unknown) => value is T;
  readonly assert: (value: unknown) => asserts value is T;
}

export class ContractValidationError extends Error {
  public readonly errors: ErrorObject[];

  constructor(public readonly typeName: string, errors: ErrorObject[] = []) {
    super(`Validation failed for contract "${typeName}"`);
    this.name = 'ContractValidationError';
    this.errors = errors;
  }
}

let ajvInstance: Ajv | undefined;

function createAjv(): Ajv {
  const ajv = new Ajv({
    strict: true,
    allErrors: true,
    allowUnionTypes: true,
  });
  addFormats(ajv);
  registerSchemas(ajv);
  return ajv;
}

function getAjv(): Ajv {
  if (!ajvInstance) {
    ajvInstance = createAjv();
  }
  return ajvInstance;
}

export function resetContractValidationState(): void {
  ajvInstance = undefined;
  schemasRegistered = false;
  validateContentScriptHeartbeatFn = undefined;
  validateContentScriptTasksUpdateFn = undefined;
  validatePopupRenderStateFn = undefined;
  validateAggregatedTabsStateFn = undefined;
  validateCodexTasksUserSettingsFn = undefined;
}

export interface ContentScriptHeartbeat {
  type: 'TASKS_HEARTBEAT';
  origin: string;
  ts: number;
  lastUpdateTs: number;
  intervalMs: number;
  respondingToPing?: boolean;
}

export interface ContentScriptTasksUpdate {
  type: 'TASKS_UPDATE';
  origin: string;
  active: boolean;
  count: number;
  signals: ContentScriptTasksUpdateSignal[];
  ts: number;
}

export interface ContentScriptTasksUpdateSignal {
  detector: 'D1_SPINNER' | 'D2_STOP_BUTTON' | 'D3_CARD_HEUR';
  evidence: string;
  taskKey?: string;
}

export interface PopupRenderState {
  generatedAt: string;
  totalActive: number;
  tabs: PopupRenderStateTab[];
  locale: 'en' | 'ru';
  messages?: Record<string, string>;
}

export interface PopupRenderStateTab {
  tabId: number;
  title: string;
  origin: string;
  count: number;
  lastSeenAt?: number;
  heartbeatStatus?: 'OK' | 'STALE';
  signals: ContentScriptTasksUpdateSignal[];
}

export interface AggregatedTabsState {
  tabs: Record<string, AggregatedTabState>;
  lastTotal: number;
  debounce: AggregatedDebounceState;
}

export interface AggregatedTabState {
  origin: string;
  title: string;
  count: number;
  active: boolean;
  updatedAt: number;
  lastSeenAt: number;
  heartbeat: AggregatedHeartbeatState;
  signals?: ContentScriptTasksUpdateSignal[];
}

export interface AggregatedHeartbeatState {
  lastReceivedAt: number;
  expectedIntervalMs: number;
  status: 'OK' | 'STALE';
  missedCount: number;
}

export interface AggregatedDebounceState {
  ms: number;
  since: number;
}

export interface CodexTasksUserSettings {
  debounceMs?: number;
  sound?: boolean;
  autoDiscardableOff?: boolean;
  showBadgeCount?: boolean;
}

export const contentScriptHeartbeatSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://codex.tasks/contracts/dto/content-heartbeat.schema.json',
  title: 'ContentScriptHeartbeat',
  description:
    'Heartbeat контент-скрипта, подтверждающий, что вкладка Codex остаётся активной',
  type: 'object',
  required: ['type', 'origin', 'ts', 'lastUpdateTs', 'intervalMs'],
  properties: {
    type: {
      const: 'TASKS_HEARTBEAT',
      description: 'Тип сообщения для роутинга в background service worker',
    },
    origin: {
      type: 'string',
      format: 'uri',
      description: 'URL вкладки Codex, откуда отправлен heartbeat',
    },
    ts: {
      type: 'number',
      description: 'Unix timestamp (мс) момента отправки heartbeat',
    },
    lastUpdateTs: {
      type: 'number',
      minimum: 0,
      description:
        'Метка времени последнего успешного `TASKS_UPDATE`, известного контент-скрипту',
    },
    intervalMs: {
      type: 'integer',
      minimum: 1000,
      maximum: 60000,
      description: 'Интервал (мс) до следующего запланированного heartbeat',
    },
    respondingToPing: {
      type: 'boolean',
      description: 'Флаг true, если heartbeat отправлен в ответ на сообщение `PING`',
    },
  },
  additionalProperties: false,
} as const;

export const contentScriptTasksUpdateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://codex.tasks/contracts/dto/content-update.schema.json',
  title: 'ContentScriptTasksUpdate',
  description: 'Сообщение контент-скрипта о текущем состоянии задач на вкладке Codex',
  type: 'object',
  required: ['type', 'origin', 'active', 'count', 'signals', 'ts'],
  properties: {
    type: {
      const: 'TASKS_UPDATE',
      description: 'Тип сообщения для роутинга в background service worker',
    },
    origin: {
      type: 'string',
      format: 'uri',
      description: 'URL вкладки Codex, из которой отправлено сообщение',
    },
    active: {
      type: 'boolean',
      description: 'Булево представление наличия активных задач на вкладке',
    },
    count: {
      type: 'integer',
      minimum: 0,
      description: 'Количество активных задач (максимум между детекторами)',
    },
    signals: {
      type: 'array',
      description: 'Детализированные сигналы детекторов для отладки и popup',
      items: {
        $ref: '#/definitions/signal',
      },
    },
    ts: {
      type: 'number',
      description: 'Unix epoch в миллисекундах момента формирования снимка',
    },
  },
  definitions: {
    signal: {
      type: 'object',
      required: ['detector', 'evidence'],
      additionalProperties: false,
      properties: {
        detector: {
          type: 'string',
          enum: ['D1_SPINNER', 'D2_STOP_BUTTON', 'D3_CARD_HEUR'],
          description: 'Идентификатор сработавшего детектора',
        },
        evidence: {
          type: 'string',
          minLength: 1,
          description: 'Краткое описание или CSS-селектор обнаруженного элемента',
        },
        taskKey: {
          type: 'string',
          minLength: 1,
          description: 'Уникальный ключ задачи (если доступен)',
        },
      },
    },
  },
  additionalProperties: false,
} as const;

export const popupRenderStateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://codex.tasks/contracts/dto/popup-state.schema.json',
  title: 'PopupRenderState',
  type: 'object',
  required: ['generatedAt', 'tabs', 'totalActive', 'locale'],
  properties: {
    generatedAt: {
      type: 'string',
      format: 'date-time',
      description: 'Время формирования данных для popup',
    },
    totalActive: {
      type: 'integer',
      minimum: 0,
      description: 'Сумма активных задач по всем вкладкам',
    },
    tabs: {
      type: 'array',
      items: {
        $ref: '#/definitions/popupTab',
      },
      description: 'Список вкладок Codex с краткой информацией для отображения',
    },
    locale: {
      type: 'string',
      enum: ['en', 'ru'],
      description: 'Выбранная локализация popup',
    },
    messages: {
      type: 'object',
      description: 'Локализованные строки интерфейса',
      patternProperties: {
        '^[a-zA-Z0-9_.-]+$': {
          type: 'string',
        },
      },
    },
  },
  definitions: {
    popupTab: {
      type: 'object',
      required: ['tabId', 'title', 'origin', 'count', 'signals'],
      additionalProperties: false,
      properties: {
        tabId: {
          type: 'integer',
          minimum: 1,
          description: 'Идентификатор вкладки Chrome',
        },
        title: {
          type: 'string',
          minLength: 1,
          description: 'Заголовок вкладки для отображения',
        },
        origin: {
          type: 'string',
          format: 'uri',
          description: 'URL вкладки',
        },
        count: {
          type: 'integer',
          minimum: 0,
          description: 'Количество активных задач',
        },
        lastSeenAt: {
          type: 'number',
          description: 'Unix timestamp (мс) последнего контакта (heartbeat или update)',
        },
        heartbeatStatus: {
          type: 'string',
          enum: ['OK', 'STALE'],
          description: 'Текущее состояние heartbeat для вкладки',
        },
        signals: {
          type: 'array',
          items: {
            $ref: './content-update.schema.json#/definitions/signal',
          },
        },
      },
    },
  },
  additionalProperties: false,
} as const;

export const aggregatedTabsStateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://codex.tasks/contracts/state/aggregated-state.schema.json',
  title: 'AggregatedTabsState',
  type: 'object',
  description: 'Состояние, которое хранит background service worker в chrome.storage.session',
  required: ['tabs', 'lastTotal', 'debounce'],
  properties: {
    tabs: {
      type: 'object',
      description: 'Словарь состояний вкладок по идентификатору tabId',
      additionalProperties: {
        $ref: '#/definitions/tabState',
      },
    },
    lastTotal: {
      type: 'integer',
      minimum: 0,
      description: 'Суммарное количество активных задач по всем вкладкам',
    },
    debounce: {
      $ref: '#/definitions/debounceState',
    },
  },
  definitions: {
    tabState: {
      type: 'object',
      required: ['origin', 'title', 'count', 'active', 'updatedAt', 'lastSeenAt', 'heartbeat'],
      additionalProperties: false,
      properties: {
        origin: {
          type: 'string',
          format: 'uri',
          description: 'URL вкладки Codex',
        },
        title: {
          type: 'string',
          minLength: 1,
          description: 'Отображаемое название вкладки',
        },
        count: {
          type: 'integer',
          minimum: 0,
          description: 'Количество активных задач, присоединённых к вкладке',
        },
        active: {
          type: 'boolean',
          description: 'Признак наличия активности по мнению контент-скрипта',
        },
        updatedAt: {
          type: 'number',
          description: 'Unix timestamp (мс) последнего обновления состояния вкладки',
        },
        lastSeenAt: {
          type: 'number',
          description:
            'Unix timestamp (мс) последнего полученного сообщения (`TASKS_UPDATE` или `TASKS_HEARTBEAT`)',
        },
        heartbeat: {
          $ref: '#/definitions/heartbeatState',
        },
        signals: {
          type: 'array',
          items: {
            $ref: '#/definitions/tabSignal',
          },
        },
      },
    },
    tabSignal: {
      allOf: [
        {
          $ref: '../dto/content-update.schema.json#/definitions/signal',
        },
      ],
    },
    heartbeatState: {
      type: 'object',
      required: ['lastReceivedAt', 'expectedIntervalMs', 'status', 'missedCount'],
      additionalProperties: false,
      properties: {
        lastReceivedAt: {
          type: 'number',
          minimum: 0,
          description: 'Unix timestamp (мс) последнего heartbeat',
        },
        expectedIntervalMs: {
          type: 'integer',
          minimum: 1000,
          maximum: 60000,
          description: 'Ожидаемый интервал между heartbeat (мс)',
        },
        status: {
          type: 'string',
          enum: ['OK', 'STALE'],
          description: 'Текущий статус heartbeat для вкладки',
        },
        missedCount: {
          type: 'integer',
          minimum: 0,
          description: 'Сколько раз подряд ожидание heartbeat было нарушено',
        },
      },
    },
    debounceState: {
      type: 'object',
      required: ['ms', 'since'],
      additionalProperties: false,
      properties: {
        ms: {
          type: 'integer',
          minimum: 0,
          maximum: 60000,
          default: 12000,
          description: 'Длительность окна антидребезга в миллисекундах',
        },
        since: {
          type: 'number',
          minimum: 0,
          description: 'Unix timestamp (мс) начала окна антидребезга; 0, если окно неактивно',
        },
      },
    },
  },
  additionalProperties: false,
} as const;

export const codexTasksUserSettingsSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://codex.tasks/contracts/settings.schema.json',
  title: 'CodexTasksUserSettings',
  description:
    'Пользовательские настройки расширения, синхронизируемые через chrome.storage.sync (v0.2.0+)',
  type: 'object',
  additionalProperties: false,
  properties: {
    debounceMs: {
      type: 'integer',
      minimum: 0,
      maximum: 60000,
      default: 12000,
      description: 'Продолжительность окна антидребезга в миллисекундах',
    },
    sound: {
      type: 'boolean',
      default: false,
      description: 'Воспроизводить ли звуковое уведомление при завершении задач',
    },
    autoDiscardableOff: {
      type: 'boolean',
      default: true,
      description:
        'Отключает авто-выгрузку вкладок Codex через chrome.tabs.update({ autoDiscardable: false })',
    },
    showBadgeCount: {
      type: 'boolean',
      default: true,
      description: 'Отображать ли количество активных задач на бейдже иконки расширения',
    },
  },
} as const;

const allSchemas = [
  contentScriptHeartbeatSchema,
  contentScriptTasksUpdateSchema,
  popupRenderStateSchema,
  aggregatedTabsStateSchema,
  codexTasksUserSettingsSchema,
] as const;

let schemasRegistered = false;

function registerSchemas(ajv: Ajv): void {
  if (schemasRegistered) {
    return;
  }
  for (const schema of allSchemas) {
    ajv.addSchema(schema);
  }
  schemasRegistered = true;
}

let validateContentScriptHeartbeatFn: ValidateFunction<ContentScriptHeartbeat> | undefined;
export function validateContentScriptHeartbeat(value: unknown): value is ContentScriptHeartbeat {
  if (!validateContentScriptHeartbeatFn) {
    validateContentScriptHeartbeatFn = getAjv().compile<ContentScriptHeartbeat>(contentScriptHeartbeatSchema);
  }
  return (validateContentScriptHeartbeatFn(value) as boolean);
}
export function assertContentScriptHeartbeat(value: unknown): asserts value is ContentScriptHeartbeat {
  if (!validateContentScriptHeartbeat(value)) {
    throw new ContractValidationError('ContentScriptHeartbeat', validateContentScriptHeartbeatFn?.errors ?? []);
  }
}

let validateContentScriptTasksUpdateFn: ValidateFunction<ContentScriptTasksUpdate> | undefined;
export function validateContentScriptTasksUpdate(value: unknown): value is ContentScriptTasksUpdate {
  if (!validateContentScriptTasksUpdateFn) {
    validateContentScriptTasksUpdateFn = getAjv().compile<ContentScriptTasksUpdate>(contentScriptTasksUpdateSchema);
  }
  return (validateContentScriptTasksUpdateFn(value) as boolean);
}
export function assertContentScriptTasksUpdate(value: unknown): asserts value is ContentScriptTasksUpdate {
  if (!validateContentScriptTasksUpdate(value)) {
    throw new ContractValidationError('ContentScriptTasksUpdate', validateContentScriptTasksUpdateFn?.errors ?? []);
  }
}

let validatePopupRenderStateFn: ValidateFunction<PopupRenderState> | undefined;
export function validatePopupRenderState(value: unknown): value is PopupRenderState {
  if (!validatePopupRenderStateFn) {
    validatePopupRenderStateFn = getAjv().compile<PopupRenderState>(popupRenderStateSchema);
  }
  return (validatePopupRenderStateFn(value) as boolean);
}
export function assertPopupRenderState(value: unknown): asserts value is PopupRenderState {
  if (!validatePopupRenderState(value)) {
    throw new ContractValidationError('PopupRenderState', validatePopupRenderStateFn?.errors ?? []);
  }
}

let validateAggregatedTabsStateFn: ValidateFunction<AggregatedTabsState> | undefined;
export function validateAggregatedTabsState(value: unknown): value is AggregatedTabsState {
  if (!validateAggregatedTabsStateFn) {
    validateAggregatedTabsStateFn = getAjv().compile<AggregatedTabsState>(aggregatedTabsStateSchema);
  }
  return (validateAggregatedTabsStateFn(value) as boolean);
}
export function assertAggregatedTabsState(value: unknown): asserts value is AggregatedTabsState {
  if (!validateAggregatedTabsState(value)) {
    throw new ContractValidationError('AggregatedTabsState', validateAggregatedTabsStateFn?.errors ?? []);
  }
}

let validateCodexTasksUserSettingsFn: ValidateFunction<CodexTasksUserSettings> | undefined;
export function validateCodexTasksUserSettings(value: unknown): value is CodexTasksUserSettings {
  if (!validateCodexTasksUserSettingsFn) {
    validateCodexTasksUserSettingsFn = getAjv().compile<CodexTasksUserSettings>(codexTasksUserSettingsSchema);
  }
  return (validateCodexTasksUserSettingsFn(value) as boolean);
}
export function assertCodexTasksUserSettings(value: unknown): asserts value is CodexTasksUserSettings {
  if (!validateCodexTasksUserSettings(value)) {
    throw new ContractValidationError('CodexTasksUserSettings', validateCodexTasksUserSettingsFn?.errors ?? []);
  }
}

export const contractRegistry = {
  ContentScriptHeartbeat: {
    schema: contentScriptHeartbeatSchema,
    validate: validateContentScriptHeartbeat,
    assert: assertContentScriptHeartbeat,
  },
  ContentScriptTasksUpdate: {
    schema: contentScriptTasksUpdateSchema,
    validate: validateContentScriptTasksUpdate,
    assert: assertContentScriptTasksUpdate,
  },
  PopupRenderState: {
    schema: popupRenderStateSchema,
    validate: validatePopupRenderState,
    assert: assertPopupRenderState,
  },
  AggregatedTabsState: {
    schema: aggregatedTabsStateSchema,
    validate: validateAggregatedTabsState,
    assert: assertAggregatedTabsState,
  },
  CodexTasksUserSettings: {
    schema: codexTasksUserSettingsSchema,
    validate: validateCodexTasksUserSettings,
    assert: assertCodexTasksUserSettings,
  },
} as const;

type ExtractAssertedType<T> = T extends (value: unknown) => asserts value is infer R ? R : never;
export type ContractType = keyof typeof contractRegistry;

export function getContractDescriptor<T extends ContractType>(type: T): ContractDescriptor<ExtractAssertedType<(typeof contractRegistry)[T]['assert']>> {
  return contractRegistry[type] as ContractDescriptor<ExtractAssertedType<(typeof contractRegistry)[T]['assert']>>;
}
