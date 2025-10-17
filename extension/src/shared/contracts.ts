// @ts-nocheck
/* eslint-disable */
/**
 * Автогенерируемый модуль. Не редактируйте вручную.
 * Скрипт генерации: scripts/generate-contracts.mjs
 */

import type { ErrorObject, ValidateFunction } from 'ajv';
import { fullFormats } from 'ajv-formats/dist/formats';

const formatUri = fullFormats.uri;
const formatDateTime = fullFormats['date-time'];
const unicodeLength = (value: string): number => {
  let length = 0;
  for (const _ of value) {
    length += 1;
  }
  return length;
};

export type ContentScriptHeartbeatType = "TASKS_HEARTBEAT";

export interface ContentScriptHeartbeat {
  "type": ContentScriptHeartbeatType;
  "origin": string;
  "ts": number;
  "lastUpdateTs": number;
  "intervalMs": number;
  "respondingToPing"?: boolean;
}

export type ContentScriptTasksUpdateType = "TASKS_UPDATE";

export type ContentScriptTasksUpdateSignalDetector = "D1_SPINNER" | "D2_STOP_BUTTON" | "D3_CARD_HEUR" | "D4_TASK_COUNTER";

export interface ContentScriptTasksUpdateSignal {
  "detector": ContentScriptTasksUpdateSignalDetector;
  "evidence": string;
  "taskKey"?: string;
}

export type ContentScriptTasksUpdateSignals = Array<ContentScriptTasksUpdateSignal>;

export interface ContentScriptTasksUpdate {
  "type": ContentScriptTasksUpdateType;
  "origin": string;
  "active": boolean;
"count": number;
  "signals": ContentScriptTasksUpdateSignals;
  "ts": number;
}

export type PopupRenderStatePopupTabHeartbeatStatus = "OK" | "STALE";

export type PopupRenderStatePopupTabSignals = Array<ContentScriptTasksUpdateSignal>;

export interface PopupRenderStatePopupTab {
  "tabId": number;
  "title": string;
  "origin": string;
  "count": number;
  "lastSeenAt"?: number;
  "heartbeatStatus"?: PopupRenderStatePopupTabHeartbeatStatus;
  "signals": PopupRenderStatePopupTabSignals;
}

export type PopupRenderStateTabs = Array<PopupRenderStatePopupTab>;

export type PopupRenderStateLocale = "en" | "ru";

export interface PopupRenderStateMessages {
  [key: string]: string;
}

export interface PopupRenderState {
  "generatedAt": string;
  "totalActive": number;
  "tabs": PopupRenderStateTabs;
  "locale": PopupRenderStateLocale;
  "messages"?: PopupRenderStateMessages;
}

export interface CodexTasksUserSettings {
  "debounceMs"?: number;
  "sound"?: boolean;
  "soundVolume"?: number;
  "autoDiscardableOff"?: boolean;
  "showBadgeCount"?: boolean;
}

export type AggregatedTabsStateHeartbeatStateStatus = "OK" | "STALE";

export interface AggregatedTabsStateHeartbeatState {
  "lastReceivedAt": number;
  "expectedIntervalMs": number;
  "status": AggregatedTabsStateHeartbeatStateStatus;
  "missedCount": number;
}

export type AggregatedTabsStateTabSignal = ContentScriptTasksUpdateSignal;

export type AggregatedTabsStateTabStateSignals = Array<AggregatedTabsStateTabSignal>;

export interface AggregatedTabsStateTabState {
  "origin": string;
  "title": string;
  "count": number;
  "active": boolean;
  "updatedAt": number;
  "lastSeenAt": number;
  "heartbeat": AggregatedTabsStateHeartbeatState;
  "signals"?: AggregatedTabsStateTabStateSignals;
}

export interface AggregatedTabsStateTabs {
  [key: string]: AggregatedTabsStateTabState;
}

export interface AggregatedTabsStateDebounceState {
  "ms": number;
  "since": number;
}

export interface AggregatedTabsState {
  "tabs": AggregatedTabsStateTabs;
  "lastTotal": number;
  "debounce": AggregatedTabsStateDebounceState;
}

export const contentScriptHeartbeatSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://codex.tasks/contracts/dto/content-heartbeat.schema.json",
  "title": "ContentScriptHeartbeat",
  "description": "Heartbeat контент-скрипта, подтверждающий, что вкладка Codex остаётся активной",
  "type": "object",
  "required": [
    "type",
    "origin",
    "ts",
    "lastUpdateTs",
    "intervalMs"
  ],
  "properties": {
    "type": {
      "const": "TASKS_HEARTBEAT",
      "description": "Тип сообщения для роутинга в background service worker"
    },
    "origin": {
      "type": "string",
      "format": "uri",
      "description": "URL вкладки Codex, откуда отправлен heartbeat"
    },
    "ts": {
      "type": "number",
      "description": "Unix timestamp (мс) момента отправки heartbeat"
    },
    "lastUpdateTs": {
      "type": "number",
      "minimum": 0,
      "description": "Метка времени последнего успешного `TASKS_UPDATE`, известного контент-скрипту"
    },
    "intervalMs": {
      "type": "integer",
      "minimum": 1000,
      "maximum": 60000,
      "description": "Интервал (мс) до следующего запланированного heartbeat"
    },
    "respondingToPing": {
      "type": "boolean",
      "description": "Флаг true, если heartbeat отправлен в ответ на сообщение `PING`"
    }
  },
  "additionalProperties": false
} as const;
export const contentScriptTasksUpdateSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://codex.tasks/contracts/dto/content-update.schema.json",
  "title": "ContentScriptTasksUpdate",
  "description": "Сообщение контент-скрипта о текущем состоянии задач на вкладке Codex",
  "type": "object",
  "required": [
    "type",
    "origin",
    "active",
    "count",
    "signals",
    "ts"
  ],
  "properties": {
    "type": {
      "const": "TASKS_UPDATE",
      "description": "Тип сообщения для роутинга в background service worker"
    },
    "origin": {
      "type": "string",
      "format": "uri",
      "description": "URL вкладки Codex, из которой отправлено сообщение"
    },
    "active": {
      "type": "boolean",
      "description": "Булево представление наличия активных задач на вкладке"
    },
    "count": {
      "type": "integer",
      "minimum": 0,
      "description": "Количество активных задач (максимум между детекторами)"
    },
    "signals": {
      "type": "array",
      "description": "Детализированные сигналы детекторов для отладки и popup",
      "items": {
        "$ref": "#/definitions/signal"
      }
    },
    "ts": {
      "type": "number",
      "description": "Unix epoch в миллисекундах момента формирования снимка"
    }
  },
  "definitions": {
    "signal": {
      "type": "object",
      "required": ["detector", "evidence"],
      "additionalProperties": false,
      "properties": {
        "detector": {
          "type": "string",
          "enum": [
            "D1_SPINNER",
            "D2_STOP_BUTTON",
            "D3_CARD_HEUR",
            "D4_TASK_COUNTER"
          ],
          "description": "Идентификатор сработавшего детектора"
        },
        "evidence": {
          "type": "string",
          "minLength": 1,
          "description": "Краткое описание или CSS-селектор обнаруженного элемента"
        },
        "taskKey": {
          "type": "string",
          "minLength": 1,
          "description": "Уникальный ключ задачи (если доступен)"
        }
      }
    }
  },
  "additionalProperties": false
} as const;
export const popupRenderStateSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://codex.tasks/contracts/dto/popup-state.schema.json",
  "title": "PopupRenderState",
  "type": "object",
  "required": ["generatedAt", "tabs", "totalActive", "locale"],
  "properties": {
    "generatedAt": {
      "type": "string",
      "format": "date-time",
      "description": "Время формирования данных для popup"
    },
    "totalActive": {
      "type": "integer",
      "minimum": 0,
      "description": "Сумма активных задач по всем вкладкам"
    },
    "tabs": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/popupTab"
      },
      "description": "Список вкладок Codex с краткой информацией для отображения"
    },
    "locale": {
      "type": "string",
      "enum": ["en", "ru"],
      "description": "Выбранная локализация popup"
    },
    "messages": {
      "type": "object",
      "description": "Локализованные строки интерфейса",
      "patternProperties": {
        "^[a-zA-Z0-9_.-]+$": {
          "type": "string"
        }
      }
    }
  },
  "definitions": {
    "popupTab": {
      "type": "object",
      "required": ["tabId", "title", "origin", "count", "signals"],
      "additionalProperties": false,
      "properties": {
        "tabId": {
          "type": "integer",
          "minimum": 1,
          "description": "Идентификатор вкладки Chrome"
        },
        "title": {
          "type": "string",
          "minLength": 1,
          "description": "Заголовок вкладки для отображения"
        },
        "origin": {
          "type": "string",
          "format": "uri",
          "description": "URL вкладки"
        },
        "count": {
          "type": "integer",
          "minimum": 0,
          "description": "Количество активных задач"
        },
        "lastSeenAt": {
          "type": "number",
          "description": "Unix timestamp (мс) последнего контакта (heartbeat или update)"
        },
        "heartbeatStatus": {
          "type": "string",
          "enum": ["OK", "STALE"],
          "description": "Текущее состояние heartbeat для вкладки"
        },
        "signals": {
          "type": "array",
          "items": {
            "$ref": "./content-update.schema.json#/definitions/signal"
          }
        }
      }
    }
  },
  "additionalProperties": false
} as const;
export const codexTasksUserSettingsSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://codex.tasks/contracts/settings.schema.json",
  "title": "CodexTasksUserSettings",
  "description": "���������������� ��������� ����������, ���������������� ����� chrome.storage.sync",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "debounceMs": {
      "type": "integer",
      "minimum": 0,
      "maximum": 60000,
      "default": 12000,
      "description": "����������������� ���� ������������ � �������������"
    },
    "sound": {
      "type": "boolean",
      "default": true,
      "description": "�������������� �������� ����������� ��� ���������� �����"
    },
    "soundVolume": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.2,
      "description": "��������� ��������� ����������� (0..1)"
    },
    "autoDiscardableOff": {
      "type": "boolean",
      "default": true,
      "description": "��������� ����-�������� ������� Codex ����� chrome.tabs.update({ autoDiscardable: false })"
    },
    "showBadgeCount": {
      "type": "boolean",
      "default": true,
      "description": "���������� �� ���������� �������� ����� �� ������ ������ ����������"
    }
  }
} as const;
export const aggregatedTabsStateSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://codex.tasks/contracts/state/aggregated-state.schema.json",
  "title": "AggregatedTabsState",
  "type": "object",
  "description": "Состояние, которое хранит background service worker в chrome.storage.session",
  "required": ["tabs", "lastTotal", "debounce"],
  "properties": {
    "tabs": {
      "type": "object",
      "description": "Словарь состояний вкладок по идентификатору tabId",
      "additionalProperties": {
        "$ref": "#/definitions/tabState"
      }
    },
    "lastTotal": {
      "type": "integer",
      "minimum": 0,
      "description": "Суммарное количество активных задач по всем вкладкам"
    },
    "debounce": {
      "$ref": "#/definitions/debounceState"
    }
  },
  "definitions": {
    "tabState": {
      "type": "object",
      "required": ["origin", "title", "count", "active", "updatedAt", "lastSeenAt", "heartbeat"],
      "additionalProperties": false,
      "properties": {
        "origin": {
          "type": "string",
          "format": "uri",
          "description": "URL вкладки Codex"
        },
        "title": {
          "type": "string",
          "minLength": 1,
          "description": "Отображаемое название вкладки"
        },
        "count": {
          "type": "integer",
          "minimum": 0,
          "description": "Количество активных задач, присоединённых к вкладке"
        },
        "active": {
          "type": "boolean",
          "description": "Признак наличия активности по мнению контент-скрипта"
        },
        "updatedAt": {
          "type": "number",
          "description": "Unix timestamp (мс) последнего обновления состояния вкладки"
        },
        "lastSeenAt": {
          "type": "number",
          "description": "Unix timestamp (мс) последнего полученного сообщения (`TASKS_UPDATE` или `TASKS_HEARTBEAT`)"
        },
        "heartbeat": {
          "$ref": "#/definitions/heartbeatState"
        },
        "signals": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/tabSignal"
          }
        }
      }
    },
    "tabSignal": {
      "allOf": [
        {
          "$ref": "../dto/content-update.schema.json#/definitions/signal"
        }
      ]
    },
    "heartbeatState": {
      "type": "object",
      "required": ["lastReceivedAt", "expectedIntervalMs", "status", "missedCount"],
      "additionalProperties": false,
      "properties": {
        "lastReceivedAt": {
          "type": "number",
          "minimum": 0,
          "description": "Unix timestamp (мс) последнего heartbeat"
        },
        "expectedIntervalMs": {
          "type": "integer",
          "minimum": 1000,
          "maximum": 60000,
          "description": "Ожидаемый интервал между heartbeat (мс)"
        },
        "status": {
          "type": "string",
          "enum": ["OK", "STALE"],
          "description": "Текущий статус heartbeat для вкладки"
        },
        "missedCount": {
          "type": "integer",
          "minimum": 0,
          "description": "Сколько раз подряд ожидание heartbeat было нарушено"
        }
      }
    },
    "debounceState": {
      "type": "object",
      "required": ["ms", "since"],
      "additionalProperties": false,
      "properties": {
        "ms": {
          "type": "integer",
          "minimum": 0,
          "maximum": 60000,
          "default": 12000,
          "description": "Длительность окна антидребезга в миллисекундах"
        },
        "since": {
          "type": "number",
          "minimum": 0,
          "description": "Unix timestamp (мс) начала окна антидребезга; 0, если окно неактивно"
        }
      }
    }
  },
  "additionalProperties": false
} as const;

export const contractSchemas = [contentScriptHeartbeatSchema, contentScriptTasksUpdateSchema, popupRenderStateSchema, codexTasksUserSettingsSchema, aggregatedTabsStateSchema] as const;

export function registerContractSchemas(registrar: { addSchema(schema: unknown): unknown }): void {
  for (const schema of contractSchemas) {
    const schemaId = (schema as { $id?: string }).$id;
    if (typeof schemaId === 'string' && 'getSchema' in registrar && typeof registrar.getSchema === 'function') {
      if (registrar.getSchema(schemaId)) {
        continue;
      }
    }
    try {
      registrar.addSchema(schema);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already exists')) {
        throw error;
      }
    }
  }
}

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

export function resetContractValidationState(): void {
  // Валидаторы предкомпилированы; состояние кэша отсутствует.
}

const validateContentScriptHeartbeatFn: ValidateFunction<ContentScriptHeartbeat> = (() => {
  const schema31 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://codex.tasks/contracts/dto/content-heartbeat.schema.json","title":"ContentScriptHeartbeat","description":"Heartbeat контент-скрипта, подтверждающий, что вкладка Codex остаётся активной","type":"object","required":["type","origin","ts","lastUpdateTs","intervalMs"],"properties":{"type":{"const":"TASKS_HEARTBEAT","description":"Тип сообщения для роутинга в background service worker"},"origin":{"type":"string","format":"uri","description":"URL вкладки Codex, откуда отправлен heartbeat"},"ts":{"type":"number","description":"Unix timestamp (мс) момента отправки heartbeat"},"lastUpdateTs":{"type":"number","minimum":0,"description":"Метка времени последнего успешного `TASKS_UPDATE`, известного контент-скрипту"},"intervalMs":{"type":"integer","minimum":1000,"maximum":60000,"description":"Интервал (мс) до следующего запланированного heartbeat"},"respondingToPing":{"type":"boolean","description":"Флаг true, если heartbeat отправлен в ответ на сообщение `PING`"}},"additionalProperties":false};const formats0 = formatUri;function validate20(data: any, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}: { instancePath?: string; parentData?: any; parentDataProperty?: any; rootData?: any; dynamicAnchors?: Record<string, unknown> } = {}){/*# sourceURL="https://codex.tasks/contracts/dto/content-heartbeat.schema.json" */;let vErrors = null;let errors = 0;const evaluated0 = validate20.evaluated;if(evaluated0.dynamicProps){evaluated0.props = undefined;}if(evaluated0.dynamicItems){evaluated0.items = undefined;}if(data && typeof data == "object" && !Array.isArray(data)){if(data.type === undefined){const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};if(vErrors === null){vErrors = [err0];}else {vErrors.push(err0);}errors++;}if(data.origin === undefined){const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "origin"},message:"must have required property '"+"origin"+"'"};if(vErrors === null){vErrors = [err1];}else {vErrors.push(err1);}errors++;}if(data.ts === undefined){const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "ts"},message:"must have required property '"+"ts"+"'"};if(vErrors === null){vErrors = [err2];}else {vErrors.push(err2);}errors++;}if(data.lastUpdateTs === undefined){const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "lastUpdateTs"},message:"must have required property '"+"lastUpdateTs"+"'"};if(vErrors === null){vErrors = [err3];}else {vErrors.push(err3);}errors++;}if(data.intervalMs === undefined){const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "intervalMs"},message:"must have required property '"+"intervalMs"+"'"};if(vErrors === null){vErrors = [err4];}else {vErrors.push(err4);}errors++;}for(const key0 in data){if(!((((((key0 === "type") || (key0 === "origin")) || (key0 === "ts")) || (key0 === "lastUpdateTs")) || (key0 === "intervalMs")) || (key0 === "respondingToPing"))){const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};if(vErrors === null){vErrors = [err5];}else {vErrors.push(err5);}errors++;}}if(data.type !== undefined){if("TASKS_HEARTBEAT" !== data.type){const err6 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/const",keyword:"const",params:{allowedValue: "TASKS_HEARTBEAT"},message:"must be equal to constant"};if(vErrors === null){vErrors = [err6];}else {vErrors.push(err6);}errors++;}}if(data.origin !== undefined){let data1 = data.origin;if(typeof data1 === "string"){if(!(formats0(data1))){const err7 = {instancePath:instancePath+"/origin",schemaPath:"#/properties/origin/format",keyword:"format",params:{format: "uri"},message:"must match format \""+"uri"+"\""};if(vErrors === null){vErrors = [err7];}else {vErrors.push(err7);}errors++;}}else {const err8 = {instancePath:instancePath+"/origin",schemaPath:"#/properties/origin/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err8];}else {vErrors.push(err8);}errors++;}}if(data.ts !== undefined){let data2 = data.ts;if(!((typeof data2 == "number") && (isFinite(data2)))){const err9 = {instancePath:instancePath+"/ts",schemaPath:"#/properties/ts/type",keyword:"type",params:{type: "number"},message:"must be number"};if(vErrors === null){vErrors = [err9];}else {vErrors.push(err9);}errors++;}}if(data.lastUpdateTs !== undefined){let data3 = data.lastUpdateTs;if((typeof data3 == "number") && (isFinite(data3))){if(data3 < 0 || isNaN(data3)){const err10 = {instancePath:instancePath+"/lastUpdateTs",schemaPath:"#/properties/lastUpdateTs/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};if(vErrors === null){vErrors = [err10];}else {vErrors.push(err10);}errors++;}}else {const err11 = {instancePath:instancePath+"/lastUpdateTs",schemaPath:"#/properties/lastUpdateTs/type",keyword:"type",params:{type: "number"},message:"must be number"};if(vErrors === null){vErrors = [err11];}else {vErrors.push(err11);}errors++;}}if(data.intervalMs !== undefined){let data4 = data.intervalMs;if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){const err12 = {instancePath:instancePath+"/intervalMs",schemaPath:"#/properties/intervalMs/type",keyword:"type",params:{type: "integer"},message:"must be integer"};if(vErrors === null){vErrors = [err12];}else {vErrors.push(err12);}errors++;}if((typeof data4 == "number") && (isFinite(data4))){if(data4 > 60000 || isNaN(data4)){const err13 = {instancePath:instancePath+"/intervalMs",schemaPath:"#/properties/intervalMs/maximum",keyword:"maximum",params:{comparison: "<=", limit: 60000},message:"must be <= 60000"};if(vErrors === null){vErrors = [err13];}else {vErrors.push(err13);}errors++;}if(data4 < 1000 || isNaN(data4)){const err14 = {instancePath:instancePath+"/intervalMs",schemaPath:"#/properties/intervalMs/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1000},message:"must be >= 1000"};if(vErrors === null){vErrors = [err14];}else {vErrors.push(err14);}errors++;}}}if(data.respondingToPing !== undefined){if(typeof data.respondingToPing !== "boolean"){const err15 = {instancePath:instancePath+"/respondingToPing",schemaPath:"#/properties/respondingToPing/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};if(vErrors === null){vErrors = [err15];}else {vErrors.push(err15);}errors++;}}}else {const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err16];}else {vErrors.push(err16);}errors++;}validate20.errors = vErrors;return errors === 0;}validate20.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};
  return validate20 as ValidateFunction<ContentScriptHeartbeat>;
})();

export function validateContentScriptHeartbeat(value: unknown): value is ContentScriptHeartbeat {
  return (validateContentScriptHeartbeatFn(value) as boolean);
}

export function assertContentScriptHeartbeat(value: unknown): asserts value is ContentScriptHeartbeat {
  if (!validateContentScriptHeartbeat(value)) {
    throw new ContractValidationError('ContentScriptHeartbeat', validateContentScriptHeartbeatFn.errors ?? []);
  }
}

const validateContentScriptTasksUpdateFn: ValidateFunction<ContentScriptTasksUpdate> = (() => {
  const schema32 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://codex.tasks/contracts/dto/content-update.schema.json","title":"ContentScriptTasksUpdate","description":"Сообщение контент-скрипта о текущем состоянии задач на вкладке Codex","type":"object","required":["type","origin","active","count","signals","ts"],"properties":{"type":{"const":"TASKS_UPDATE","description":"Тип сообщения для роутинга в background service worker"},"origin":{"type":"string","format":"uri","description":"URL вкладки Codex, из которой отправлено сообщение"},"active":{"type":"boolean","description":"Булево представление наличия активных задач на вкладке"},"count":{"type":"integer","minimum":0,"description":"Количество активных задач (максимум между детекторами)"},"signals":{"type":"array","description":"Детализированные сигналы детекторов для отладки и popup","items":{"$ref":"#/definitions/signal"}},"ts":{"type":"number","description":"Unix epoch в миллисекундах момента формирования снимка"}},"definitions":{"signal":{"type":"object","required":["detector","evidence"],"additionalProperties":false,"properties":{"detector":{"type":"string","enum":["D1_SPINNER","D2_STOP_BUTTON","D3_CARD_HEUR","D4_TASK_COUNTER"],"description":"Идентификатор сработавшего детектора"},"evidence":{"type":"string","minLength":1,"description":"Краткое описание или CSS-селектор обнаруженного элемента"},"taskKey":{"type":"string","minLength":1,"description":"Уникальный ключ задачи (если доступен)"}}}},"additionalProperties":false};const schema33 = {"type":"object","required":["detector","evidence"],"additionalProperties":false,"properties":{"detector":{"type":"string","enum":["D1_SPINNER","D2_STOP_BUTTON","D3_CARD_HEUR","D4_TASK_COUNTER"],"description":"Идентификатор сработавшего детектора"},"evidence":{"type":"string","minLength":1,"description":"Краткое описание или CSS-селектор обнаруженного элемента"},"taskKey":{"type":"string","minLength":1,"description":"Уникальный ключ задачи (если доступен)"}}};const formats0 = formatUri;const func1 = unicodeLength;function validate21(data: any, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}: { instancePath?: string; parentData?: any; parentDataProperty?: any; rootData?: any; dynamicAnchors?: Record<string, unknown> } = {}){/*# sourceURL="https://codex.tasks/contracts/dto/content-update.schema.json" */;let vErrors = null;let errors = 0;const evaluated0 = validate21.evaluated;if(evaluated0.dynamicProps){evaluated0.props = undefined;}if(evaluated0.dynamicItems){evaluated0.items = undefined;}if(data && typeof data == "object" && !Array.isArray(data)){if(data.type === undefined){const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};if(vErrors === null){vErrors = [err0];}else {vErrors.push(err0);}errors++;}if(data.origin === undefined){const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "origin"},message:"must have required property '"+"origin"+"'"};if(vErrors === null){vErrors = [err1];}else {vErrors.push(err1);}errors++;}if(data.active === undefined){const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "active"},message:"must have required property '"+"active"+"'"};if(vErrors === null){vErrors = [err2];}else {vErrors.push(err2);}errors++;}if(data.count === undefined){const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "count"},message:"must have required property '"+"count"+"'"};if(vErrors === null){vErrors = [err3];}else {vErrors.push(err3);}errors++;}if(data.signals === undefined){const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "signals"},message:"must have required property '"+"signals"+"'"};if(vErrors === null){vErrors = [err4];}else {vErrors.push(err4);}errors++;}if(data.ts === undefined){const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "ts"},message:"must have required property '"+"ts"+"'"};if(vErrors === null){vErrors = [err5];}else {vErrors.push(err5);}errors++;}for(const key0 in data){if(!((((((key0 === "type") || (key0 === "origin")) || (key0 === "active")) || (key0 === "count")) || (key0 === "signals")) || (key0 === "ts"))){const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};if(vErrors === null){vErrors = [err6];}else {vErrors.push(err6);}errors++;}}if(data.type !== undefined){if("TASKS_UPDATE" !== data.type){const err7 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/const",keyword:"const",params:{allowedValue: "TASKS_UPDATE"},message:"must be equal to constant"};if(vErrors === null){vErrors = [err7];}else {vErrors.push(err7);}errors++;}}if(data.origin !== undefined){let data1 = data.origin;if(typeof data1 === "string"){if(!(formats0(data1))){const err8 = {instancePath:instancePath+"/origin",schemaPath:"#/properties/origin/format",keyword:"format",params:{format: "uri"},message:"must match format \""+"uri"+"\""};if(vErrors === null){vErrors = [err8];}else {vErrors.push(err8);}errors++;}}else {const err9 = {instancePath:instancePath+"/origin",schemaPath:"#/properties/origin/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err9];}else {vErrors.push(err9);}errors++;}}if(data.active !== undefined){if(typeof data.active !== "boolean"){const err10 = {instancePath:instancePath+"/active",schemaPath:"#/properties/active/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};if(vErrors === null){vErrors = [err10];}else {vErrors.push(err10);}errors++;}}if(data.count !== undefined){let data3 = data.count;if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){const err11 = {instancePath:instancePath+"/count",schemaPath:"#/properties/count/type",keyword:"type",params:{type: "integer"},message:"must be integer"};if(vErrors === null){vErrors = [err11];}else {vErrors.push(err11);}errors++;}if((typeof data3 == "number") && (isFinite(data3))){if(data3 < 0 || isNaN(data3)){const err12 = {instancePath:instancePath+"/count",schemaPath:"#/properties/count/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};if(vErrors === null){vErrors = [err12];}else {vErrors.push(err12);}errors++;}}}if(data.signals !== undefined){let data4 = data.signals;if(Array.isArray(data4)){const len0 = data4.length;for(let i0=0; i0<len0; i0++){let data5 = data4[i0];if(data5 && typeof data5 == "object" && !Array.isArray(data5)){if(data5.detector === undefined){const err13 = {instancePath:instancePath+"/signals/" + i0,schemaPath:"#/definitions/signal/required",keyword:"required",params:{missingProperty: "detector"},message:"must have required property '"+"detector"+"'"};if(vErrors === null){vErrors = [err13];}else {vErrors.push(err13);}errors++;}if(data5.evidence === undefined){const err14 = {instancePath:instancePath+"/signals/" + i0,schemaPath:"#/definitions/signal/required",keyword:"required",params:{missingProperty: "evidence"},message:"must have required property '"+"evidence"+"'"};if(vErrors === null){vErrors = [err14];}else {vErrors.push(err14);}errors++;}for(const key1 in data5){if(!(((key1 === "detector") || (key1 === "evidence")) || (key1 === "taskKey"))){const err15 = {instancePath:instancePath+"/signals/" + i0,schemaPath:"#/definitions/signal/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};if(vErrors === null){vErrors = [err15];}else {vErrors.push(err15);}errors++;}}if(data5.detector !== undefined){let data6 = data5.detector;if(typeof data6 !== "string"){const err16 = {instancePath:instancePath+"/signals/" + i0+"/detector",schemaPath:"#/definitions/signal/properties/detector/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err16];}else {vErrors.push(err16);}errors++;}if(!((((data6 === "D1_SPINNER") || (data6 === "D2_STOP_BUTTON")) || (data6 === "D3_CARD_HEUR")) || (data6 === "D4_TASK_COUNTER"))){const err17 = {instancePath:instancePath+"/signals/" + i0+"/detector",schemaPath:"#/definitions/signal/properties/detector/enum",keyword:"enum",params:{allowedValues: schema33.properties.detector.enum},message:"must be equal to one of the allowed values"};if(vErrors === null){vErrors = [err17];}else {vErrors.push(err17);}errors++;}}if(data5.evidence !== undefined){let data7 = data5.evidence;if(typeof data7 === "string"){if(func1(data7) < 1){const err18 = {instancePath:instancePath+"/signals/" + i0+"/evidence",schemaPath:"#/definitions/signal/properties/evidence/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};if(vErrors === null){vErrors = [err18];}else {vErrors.push(err18);}errors++;}}else {const err19 = {instancePath:instancePath+"/signals/" + i0+"/evidence",schemaPath:"#/definitions/signal/properties/evidence/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err19];}else {vErrors.push(err19);}errors++;}}if(data5.taskKey !== undefined){let data8 = data5.taskKey;if(typeof data8 === "string"){if(func1(data8) < 1){const err20 = {instancePath:instancePath+"/signals/" + i0+"/taskKey",schemaPath:"#/definitions/signal/properties/taskKey/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};if(vErrors === null){vErrors = [err20];}else {vErrors.push(err20);}errors++;}}else {const err21 = {instancePath:instancePath+"/signals/" + i0+"/taskKey",schemaPath:"#/definitions/signal/properties/taskKey/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err21];}else {vErrors.push(err21);}errors++;}}}else {const err22 = {instancePath:instancePath+"/signals/" + i0,schemaPath:"#/definitions/signal/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err22];}else {vErrors.push(err22);}errors++;}}}else {const err23 = {instancePath:instancePath+"/signals",schemaPath:"#/properties/signals/type",keyword:"type",params:{type: "array"},message:"must be array"};if(vErrors === null){vErrors = [err23];}else {vErrors.push(err23);}errors++;}}if(data.ts !== undefined){let data9 = data.ts;if(!((typeof data9 == "number") && (isFinite(data9)))){const err24 = {instancePath:instancePath+"/ts",schemaPath:"#/properties/ts/type",keyword:"type",params:{type: "number"},message:"must be number"};if(vErrors === null){vErrors = [err24];}else {vErrors.push(err24);}errors++;}}}else {const err25 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err25];}else {vErrors.push(err25);}errors++;}validate21.errors = vErrors;return errors === 0;}validate21.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};
  return validate21 as ValidateFunction<ContentScriptTasksUpdate>;
})();

export function validateContentScriptTasksUpdate(value: unknown): value is ContentScriptTasksUpdate {
  return (validateContentScriptTasksUpdateFn(value) as boolean);
}

export function assertContentScriptTasksUpdate(value: unknown): asserts value is ContentScriptTasksUpdate {
  if (!validateContentScriptTasksUpdate(value)) {
    throw new ContractValidationError('ContentScriptTasksUpdate', validateContentScriptTasksUpdateFn.errors ?? []);
  }
}

const validatePopupRenderStateFn: ValidateFunction<PopupRenderState> = (() => {
  const schema34 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://codex.tasks/contracts/dto/popup-state.schema.json","title":"PopupRenderState","type":"object","required":["generatedAt","tabs","totalActive","locale"],"properties":{"generatedAt":{"type":"string","format":"date-time","description":"Время формирования данных для popup"},"totalActive":{"type":"integer","minimum":0,"description":"Сумма активных задач по всем вкладкам"},"tabs":{"type":"array","items":{"$ref":"#/definitions/popupTab"},"description":"Список вкладок Codex с краткой информацией для отображения"},"locale":{"type":"string","enum":["en","ru"],"description":"Выбранная локализация popup"},"messages":{"type":"object","description":"Локализованные строки интерфейса","patternProperties":{"^[a-zA-Z0-9_.-]+$":{"type":"string"}}}},"definitions":{"popupTab":{"type":"object","required":["tabId","title","origin","count","signals"],"additionalProperties":false,"properties":{"tabId":{"type":"integer","minimum":1,"description":"Идентификатор вкладки Chrome"},"title":{"type":"string","minLength":1,"description":"Заголовок вкладки для отображения"},"origin":{"type":"string","format":"uri","description":"URL вкладки"},"count":{"type":"integer","minimum":0,"description":"Количество активных задач"},"lastSeenAt":{"type":"number","description":"Unix timestamp (мс) последнего контакта (heartbeat или update)"},"heartbeatStatus":{"type":"string","enum":["OK","STALE"],"description":"Текущее состояние heartbeat для вкладки"},"signals":{"type":"array","items":{"$ref":"./content-update.schema.json#/definitions/signal"}}}}},"additionalProperties":false};const formats4 = formatDateTime;const schema35 = {"type":"object","required":["tabId","title","origin","count","signals"],"additionalProperties":false,"properties":{"tabId":{"type":"integer","minimum":1,"description":"Идентификатор вкладки Chrome"},"title":{"type":"string","minLength":1,"description":"Заголовок вкладки для отображения"},"origin":{"type":"string","format":"uri","description":"URL вкладки"},"count":{"type":"integer","minimum":0,"description":"Количество активных задач"},"lastSeenAt":{"type":"number","description":"Unix timestamp (мс) последнего контакта (heartbeat или update)"},"heartbeatStatus":{"type":"string","enum":["OK","STALE"],"description":"Текущее состояние heartbeat для вкладки"},"signals":{"type":"array","items":{"$ref":"./content-update.schema.json#/definitions/signal"}}}};const schema33 = {"type":"object","required":["detector","evidence"],"additionalProperties":false,"properties":{"detector":{"type":"string","enum":["D1_SPINNER","D2_STOP_BUTTON","D3_CARD_HEUR","D4_TASK_COUNTER"],"description":"Идентификатор сработавшего детектора"},"evidence":{"type":"string","minLength":1,"description":"Краткое описание или CSS-селектор обнаруженного элемента"},"taskKey":{"type":"string","minLength":1,"description":"Уникальный ключ задачи (если доступен)"}}};const func1 = unicodeLength;const formats0 = formatUri;function validate23(data: any, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}: { instancePath?: string; parentData?: any; parentDataProperty?: any; rootData?: any; dynamicAnchors?: Record<string, unknown> } = {}){let vErrors = null;let errors = 0;const evaluated0 = validate23.evaluated;if(evaluated0.dynamicProps){evaluated0.props = undefined;}if(evaluated0.dynamicItems){evaluated0.items = undefined;}if(data && typeof data == "object" && !Array.isArray(data)){if(data.tabId === undefined){const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "tabId"},message:"must have required property '"+"tabId"+"'"};if(vErrors === null){vErrors = [err0];}else {vErrors.push(err0);}errors++;}if(data.title === undefined){const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};if(vErrors === null){vErrors = [err1];}else {vErrors.push(err1);}errors++;}if(data.origin === undefined){const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "origin"},message:"must have required property '"+"origin"+"'"};if(vErrors === null){vErrors = [err2];}else {vErrors.push(err2);}errors++;}if(data.count === undefined){const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "count"},message:"must have required property '"+"count"+"'"};if(vErrors === null){vErrors = [err3];}else {vErrors.push(err3);}errors++;}if(data.signals === undefined){const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "signals"},message:"must have required property '"+"signals"+"'"};if(vErrors === null){vErrors = [err4];}else {vErrors.push(err4);}errors++;}for(const key0 in data){if(!(((((((key0 === "tabId") || (key0 === "title")) || (key0 === "origin")) || (key0 === "count")) || (key0 === "lastSeenAt")) || (key0 === "heartbeatStatus")) || (key0 === "signals"))){const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};if(vErrors === null){vErrors = [err5];}else {vErrors.push(err5);}errors++;}}if(data.tabId !== undefined){let data0 = data.tabId;if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){const err6 = {instancePath:instancePath+"/tabId",schemaPath:"#/properties/tabId/type",keyword:"type",params:{type: "integer"},message:"must be integer"};if(vErrors === null){vErrors = [err6];}else {vErrors.push(err6);}errors++;}if((typeof data0 == "number") && (isFinite(data0))){if(data0 < 1 || isNaN(data0)){const err7 = {instancePath:instancePath+"/tabId",schemaPath:"#/properties/tabId/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};if(vErrors === null){vErrors = [err7];}else {vErrors.push(err7);}errors++;}}}if(data.title !== undefined){let data1 = data.title;if(typeof data1 === "string"){if(func1(data1) < 1){const err8 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};if(vErrors === null){vErrors = [err8];}else {vErrors.push(err8);}errors++;}}else {const err9 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err9];}else {vErrors.push(err9);}errors++;}}if(data.origin !== undefined){let data2 = data.origin;if(typeof data2 === "string"){if(!(formats0(data2))){const err10 = {instancePath:instancePath+"/origin",schemaPath:"#/properties/origin/format",keyword:"format",params:{format: "uri"},message:"must match format \""+"uri"+"\""};if(vErrors === null){vErrors = [err10];}else {vErrors.push(err10);}errors++;}}else {const err11 = {instancePath:instancePath+"/origin",schemaPath:"#/properties/origin/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err11];}else {vErrors.push(err11);}errors++;}}if(data.count !== undefined){let data3 = data.count;if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){const err12 = {instancePath:instancePath+"/count",schemaPath:"#/properties/count/type",keyword:"type",params:{type: "integer"},message:"must be integer"};if(vErrors === null){vErrors = [err12];}else {vErrors.push(err12);}errors++;}if((typeof data3 == "number") && (isFinite(data3))){if(data3 < 0 || isNaN(data3)){const err13 = {instancePath:instancePath+"/count",schemaPath:"#/properties/count/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};if(vErrors === null){vErrors = [err13];}else {vErrors.push(err13);}errors++;}}}if(data.lastSeenAt !== undefined){let data4 = data.lastSeenAt;if(!((typeof data4 == "number") && (isFinite(data4)))){const err14 = {instancePath:instancePath+"/lastSeenAt",schemaPath:"#/properties/lastSeenAt/type",keyword:"type",params:{type: "number"},message:"must be number"};if(vErrors === null){vErrors = [err14];}else {vErrors.push(err14);}errors++;}}if(data.heartbeatStatus !== undefined){let data5 = data.heartbeatStatus;if(typeof data5 !== "string"){const err15 = {instancePath:instancePath+"/heartbeatStatus",schemaPath:"#/properties/heartbeatStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err15];}else {vErrors.push(err15);}errors++;}if(!((data5 === "OK") || (data5 === "STALE"))){const err16 = {instancePath:instancePath+"/heartbeatStatus",schemaPath:"#/properties/heartbeatStatus/enum",keyword:"enum",params:{allowedValues: schema35.properties.heartbeatStatus.enum},message:"must be equal to one of the allowed values"};if(vErrors === null){vErrors = [err16];}else {vErrors.push(err16);}errors++;}}if(data.signals !== undefined){let data6 = data.signals;if(Array.isArray(data6)){const len0 = data6.length;for(let i0=0; i0<len0; i0++){let data7 = data6[i0];if(data7 && typeof data7 == "object" && !Array.isArray(data7)){if(data7.detector === undefined){const err17 = {instancePath:instancePath+"/signals/" + i0,schemaPath:"./content-update.schema.json#/definitions/signal/required",keyword:"required",params:{missingProperty: "detector"},message:"must have required property '"+"detector"+"'"};if(vErrors === null){vErrors = [err17];}else {vErrors.push(err17);}errors++;}if(data7.evidence === undefined){const err18 = {instancePath:instancePath+"/signals/" + i0,schemaPath:"./content-update.schema.json#/definitions/signal/required",keyword:"required",params:{missingProperty: "evidence"},message:"must have required property '"+"evidence"+"'"};if(vErrors === null){vErrors = [err18];}else {vErrors.push(err18);}errors++;}for(const key1 in data7){if(!(((key1 === "detector") || (key1 === "evidence")) || (key1 === "taskKey"))){const err19 = {instancePath:instancePath+"/signals/" + i0,schemaPath:"./content-update.schema.json#/definitions/signal/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};if(vErrors === null){vErrors = [err19];}else {vErrors.push(err19);}errors++;}}if(data7.detector !== undefined){let data8 = data7.detector;if(typeof data8 !== "string"){const err20 = {instancePath:instancePath+"/signals/" + i0+"/detector",schemaPath:"./content-update.schema.json#/definitions/signal/properties/detector/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err20];}else {vErrors.push(err20);}errors++;}if(!((((data8 === "D1_SPINNER") || (data8 === "D2_STOP_BUTTON")) || (data8 === "D3_CARD_HEUR")) || (data8 === "D4_TASK_COUNTER"))){const err21 = {instancePath:instancePath+"/signals/" + i0+"/detector",schemaPath:"./content-update.schema.json#/definitions/signal/properties/detector/enum",keyword:"enum",params:{allowedValues: schema33.properties.detector.enum},message:"must be equal to one of the allowed values"};if(vErrors === null){vErrors = [err21];}else {vErrors.push(err21);}errors++;}}if(data7.evidence !== undefined){let data9 = data7.evidence;if(typeof data9 === "string"){if(func1(data9) < 1){const err22 = {instancePath:instancePath+"/signals/" + i0+"/evidence",schemaPath:"./content-update.schema.json#/definitions/signal/properties/evidence/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};if(vErrors === null){vErrors = [err22];}else {vErrors.push(err22);}errors++;}}else {const err23 = {instancePath:instancePath+"/signals/" + i0+"/evidence",schemaPath:"./content-update.schema.json#/definitions/signal/properties/evidence/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err23];}else {vErrors.push(err23);}errors++;}}if(data7.taskKey !== undefined){let data10 = data7.taskKey;if(typeof data10 === "string"){if(func1(data10) < 1){const err24 = {instancePath:instancePath+"/signals/" + i0+"/taskKey",schemaPath:"./content-update.schema.json#/definitions/signal/properties/taskKey/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};if(vErrors === null){vErrors = [err24];}else {vErrors.push(err24);}errors++;}}else {const err25 = {instancePath:instancePath+"/signals/" + i0+"/taskKey",schemaPath:"./content-update.schema.json#/definitions/signal/properties/taskKey/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err25];}else {vErrors.push(err25);}errors++;}}}else {const err26 = {instancePath:instancePath+"/signals/" + i0,schemaPath:"./content-update.schema.json#/definitions/signal/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err26];}else {vErrors.push(err26);}errors++;}}}else {const err27 = {instancePath:instancePath+"/signals",schemaPath:"#/properties/signals/type",keyword:"type",params:{type: "array"},message:"must be array"};if(vErrors === null){vErrors = [err27];}else {vErrors.push(err27);}errors++;}}}else {const err28 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err28];}else {vErrors.push(err28);}errors++;}validate23.errors = vErrors;return errors === 0;}validate23.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};const pattern4 = new RegExp("^[a-zA-Z0-9_.-]+$", "u");function validate22(data: any, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}: { instancePath?: string; parentData?: any; parentDataProperty?: any; rootData?: any; dynamicAnchors?: Record<string, unknown> } = {}){/*# sourceURL="https://codex.tasks/contracts/dto/popup-state.schema.json" */;let vErrors = null;let errors = 0;const evaluated0 = validate22.evaluated;if(evaluated0.dynamicProps){evaluated0.props = undefined;}if(evaluated0.dynamicItems){evaluated0.items = undefined;}if(data && typeof data == "object" && !Array.isArray(data)){if(data.generatedAt === undefined){const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "generatedAt"},message:"must have required property '"+"generatedAt"+"'"};if(vErrors === null){vErrors = [err0];}else {vErrors.push(err0);}errors++;}if(data.tabs === undefined){const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "tabs"},message:"must have required property '"+"tabs"+"'"};if(vErrors === null){vErrors = [err1];}else {vErrors.push(err1);}errors++;}if(data.totalActive === undefined){const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "totalActive"},message:"must have required property '"+"totalActive"+"'"};if(vErrors === null){vErrors = [err2];}else {vErrors.push(err2);}errors++;}if(data.locale === undefined){const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "locale"},message:"must have required property '"+"locale"+"'"};if(vErrors === null){vErrors = [err3];}else {vErrors.push(err3);}errors++;}for(const key0 in data){if(!(((((key0 === "generatedAt") || (key0 === "totalActive")) || (key0 === "tabs")) || (key0 === "locale")) || (key0 === "messages"))){const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};if(vErrors === null){vErrors = [err4];}else {vErrors.push(err4);}errors++;}}if(data.generatedAt !== undefined){let data0 = data.generatedAt;if(typeof data0 === "string"){if(!(formats4.validate(data0))){const err5 = {instancePath:instancePath+"/generatedAt",schemaPath:"#/properties/generatedAt/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};if(vErrors === null){vErrors = [err5];}else {vErrors.push(err5);}errors++;}}else {const err6 = {instancePath:instancePath+"/generatedAt",schemaPath:"#/properties/generatedAt/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err6];}else {vErrors.push(err6);}errors++;}}if(data.totalActive !== undefined){let data1 = data.totalActive;if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){const err7 = {instancePath:instancePath+"/totalActive",schemaPath:"#/properties/totalActive/type",keyword:"type",params:{type: "integer"},message:"must be integer"};if(vErrors === null){vErrors = [err7];}else {vErrors.push(err7);}errors++;}if((typeof data1 == "number") && (isFinite(data1))){if(data1 < 0 || isNaN(data1)){const err8 = {instancePath:instancePath+"/totalActive",schemaPath:"#/properties/totalActive/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};if(vErrors === null){vErrors = [err8];}else {vErrors.push(err8);}errors++;}}}if(data.tabs !== undefined){let data2 = data.tabs;if(Array.isArray(data2)){const len0 = data2.length;for(let i0=0; i0<len0; i0++){if(!(validate23(data2[i0], {instancePath:instancePath+"/tabs/" + i0,parentData:data2,parentDataProperty:i0,rootData,dynamicAnchors}))){vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);errors = vErrors.length;}}}else {const err9 = {instancePath:instancePath+"/tabs",schemaPath:"#/properties/tabs/type",keyword:"type",params:{type: "array"},message:"must be array"};if(vErrors === null){vErrors = [err9];}else {vErrors.push(err9);}errors++;}}if(data.locale !== undefined){let data4 = data.locale;if(typeof data4 !== "string"){const err10 = {instancePath:instancePath+"/locale",schemaPath:"#/properties/locale/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err10];}else {vErrors.push(err10);}errors++;}if(!((data4 === "en") || (data4 === "ru"))){const err11 = {instancePath:instancePath+"/locale",schemaPath:"#/properties/locale/enum",keyword:"enum",params:{allowedValues: schema34.properties.locale.enum},message:"must be equal to one of the allowed values"};if(vErrors === null){vErrors = [err11];}else {vErrors.push(err11);}errors++;}}if(data.messages !== undefined){let data5 = data.messages;if(data5 && typeof data5 == "object" && !Array.isArray(data5)){var props0 = {};for(const key1 in data5){if(pattern4.test(key1)){if(typeof data5[key1] !== "string"){const err12 = {instancePath:instancePath+"/messages/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/messages/patternProperties/%5E%5Ba-zA-Z0-9_.-%5D%2B%24/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err12];}else {vErrors.push(err12);}errors++;}props0[key1] = true;}}}else {const err13 = {instancePath:instancePath+"/messages",schemaPath:"#/properties/messages/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err13];}else {vErrors.push(err13);}errors++;}}}else {const err14 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err14];}else {vErrors.push(err14);}errors++;}validate22.errors = vErrors;return errors === 0;}validate22.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};
  return validate22 as ValidateFunction<PopupRenderState>;
})();

export function validatePopupRenderState(value: unknown): value is PopupRenderState {
  return (validatePopupRenderStateFn(value) as boolean);
}

export function assertPopupRenderState(value: unknown): asserts value is PopupRenderState {
  if (!validatePopupRenderState(value)) {
    throw new ContractValidationError('PopupRenderState', validatePopupRenderStateFn.errors ?? []);
  }
}

const validateCodexTasksUserSettingsFn: ValidateFunction<CodexTasksUserSettings> = (() => {
  const schema37 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://codex.tasks/contracts/settings.schema.json","title":"CodexTasksUserSettings","description":"���������������� ��������� ����������, ���������������� ����� chrome.storage.sync","type":"object","additionalProperties":false,"properties":{"debounceMs":{"type":"integer","minimum":0,"maximum":60000,"default":12000,"description":"����������������� ���� ������������ � �������������"},"sound":{"type":"boolean","default":true,"description":"�������������� �������� ����������� ��� ���������� �����"},"soundVolume":{"type":"number","minimum":0,"maximum":1,"default":0.2,"description":"��������� ��������� ����������� (0..1)"},"autoDiscardableOff":{"type":"boolean","default":true,"description":"��������� ����-�������� ������� Codex ����� chrome.tabs.update({ autoDiscardable: false })"},"showBadgeCount":{"type":"boolean","default":true,"description":"���������� �� ���������� �������� ����� �� ������ ������ ����������"}}};function validate25(data: any, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}: { instancePath?: string; parentData?: any; parentDataProperty?: any; rootData?: any; dynamicAnchors?: Record<string, unknown> } = {}){/*# sourceURL="https://codex.tasks/contracts/settings.schema.json" */;let vErrors = null;let errors = 0;const evaluated0 = validate25.evaluated;if(evaluated0.dynamicProps){evaluated0.props = undefined;}if(evaluated0.dynamicItems){evaluated0.items = undefined;}if(data && typeof data == "object" && !Array.isArray(data)){for(const key0 in data){if(!(((((key0 === "debounceMs") || (key0 === "sound")) || (key0 === "soundVolume")) || (key0 === "autoDiscardableOff")) || (key0 === "showBadgeCount"))){const err0 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};if(vErrors === null){vErrors = [err0];}else {vErrors.push(err0);}errors++;}}if(data.debounceMs !== undefined){let data0 = data.debounceMs;if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){const err1 = {instancePath:instancePath+"/debounceMs",schemaPath:"#/properties/debounceMs/type",keyword:"type",params:{type: "integer"},message:"must be integer"};if(vErrors === null){vErrors = [err1];}else {vErrors.push(err1);}errors++;}if((typeof data0 == "number") && (isFinite(data0))){if(data0 > 60000 || isNaN(data0)){const err2 = {instancePath:instancePath+"/debounceMs",schemaPath:"#/properties/debounceMs/maximum",keyword:"maximum",params:{comparison: "<=", limit: 60000},message:"must be <= 60000"};if(vErrors === null){vErrors = [err2];}else {vErrors.push(err2);}errors++;}if(data0 < 0 || isNaN(data0)){const err3 = {instancePath:instancePath+"/debounceMs",schemaPath:"#/properties/debounceMs/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};if(vErrors === null){vErrors = [err3];}else {vErrors.push(err3);}errors++;}}}if(data.sound !== undefined){if(typeof data.sound !== "boolean"){const err4 = {instancePath:instancePath+"/sound",schemaPath:"#/properties/sound/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};if(vErrors === null){vErrors = [err4];}else {vErrors.push(err4);}errors++;}}if(data.soundVolume !== undefined){let data2 = data.soundVolume;if((typeof data2 == "number") && (isFinite(data2))){if(data2 > 1 || isNaN(data2)){const err5 = {instancePath:instancePath+"/soundVolume",schemaPath:"#/properties/soundVolume/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1},message:"must be <= 1"};if(vErrors === null){vErrors = [err5];}else {vErrors.push(err5);}errors++;}if(data2 < 0 || isNaN(data2)){const err6 = {instancePath:instancePath+"/soundVolume",schemaPath:"#/properties/soundVolume/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};if(vErrors === null){vErrors = [err6];}else {vErrors.push(err6);}errors++;}}else {const err7 = {instancePath:instancePath+"/soundVolume",schemaPath:"#/properties/soundVolume/type",keyword:"type",params:{type: "number"},message:"must be number"};if(vErrors === null){vErrors = [err7];}else {vErrors.push(err7);}errors++;}}if(data.autoDiscardableOff !== undefined){if(typeof data.autoDiscardableOff !== "boolean"){const err8 = {instancePath:instancePath+"/autoDiscardableOff",schemaPath:"#/properties/autoDiscardableOff/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};if(vErrors === null){vErrors = [err8];}else {vErrors.push(err8);}errors++;}}if(data.showBadgeCount !== undefined){if(typeof data.showBadgeCount !== "boolean"){const err9 = {instancePath:instancePath+"/showBadgeCount",schemaPath:"#/properties/showBadgeCount/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};if(vErrors === null){vErrors = [err9];}else {vErrors.push(err9);}errors++;}}}else {const err10 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err10];}else {vErrors.push(err10);}errors++;}validate25.errors = vErrors;return errors === 0;}validate25.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};
  return validate25 as ValidateFunction<CodexTasksUserSettings>;
})();

export function validateCodexTasksUserSettings(value: unknown): value is CodexTasksUserSettings {
  return (validateCodexTasksUserSettingsFn(value) as boolean);
}

export function assertCodexTasksUserSettings(value: unknown): asserts value is CodexTasksUserSettings {
  if (!validateCodexTasksUserSettings(value)) {
    throw new ContractValidationError('CodexTasksUserSettings', validateCodexTasksUserSettingsFn.errors ?? []);
  }
}

const validateAggregatedTabsStateFn: ValidateFunction<AggregatedTabsState> = (() => {
  const schema38 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://codex.tasks/contracts/state/aggregated-state.schema.json","title":"AggregatedTabsState","type":"object","description":"Состояние, которое хранит background service worker в chrome.storage.session","required":["tabs","lastTotal","debounce"],"properties":{"tabs":{"type":"object","description":"Словарь состояний вкладок по идентификатору tabId","additionalProperties":{"$ref":"#/definitions/tabState"}},"lastTotal":{"type":"integer","minimum":0,"description":"Суммарное количество активных задач по всем вкладкам"},"debounce":{"$ref":"#/definitions/debounceState"}},"definitions":{"tabState":{"type":"object","required":["origin","title","count","active","updatedAt","lastSeenAt","heartbeat"],"additionalProperties":false,"properties":{"origin":{"type":"string","format":"uri","description":"URL вкладки Codex"},"title":{"type":"string","minLength":1,"description":"Отображаемое название вкладки"},"count":{"type":"integer","minimum":0,"description":"Количество активных задач, присоединённых к вкладке"},"active":{"type":"boolean","description":"Признак наличия активности по мнению контент-скрипта"},"updatedAt":{"type":"number","description":"Unix timestamp (мс) последнего обновления состояния вкладки"},"lastSeenAt":{"type":"number","description":"Unix timestamp (мс) последнего полученного сообщения (`TASKS_UPDATE` или `TASKS_HEARTBEAT`)"},"heartbeat":{"$ref":"#/definitions/heartbeatState"},"signals":{"type":"array","items":{"$ref":"#/definitions/tabSignal"}}}},"tabSignal":{"allOf":[{"$ref":"../dto/content-update.schema.json#/definitions/signal"}]},"heartbeatState":{"type":"object","required":["lastReceivedAt","expectedIntervalMs","status","missedCount"],"additionalProperties":false,"properties":{"lastReceivedAt":{"type":"number","minimum":0,"description":"Unix timestamp (мс) последнего heartbeat"},"expectedIntervalMs":{"type":"integer","minimum":1000,"maximum":60000,"description":"Ожидаемый интервал между heartbeat (мс)"},"status":{"type":"string","enum":["OK","STALE"],"description":"Текущий статус heartbeat для вкладки"},"missedCount":{"type":"integer","minimum":0,"description":"Сколько раз подряд ожидание heartbeat было нарушено"}}},"debounceState":{"type":"object","required":["ms","since"],"additionalProperties":false,"properties":{"ms":{"type":"integer","minimum":0,"maximum":60000,"default":12000,"description":"Длительность окна антидребезга в миллисекундах"},"since":{"type":"number","minimum":0,"description":"Unix timestamp (мс) начала окна антидребезга; 0, если окно неактивно"}}}},"additionalProperties":false};const schema43 = {"type":"object","required":["ms","since"],"additionalProperties":false,"properties":{"ms":{"type":"integer","minimum":0,"maximum":60000,"default":12000,"description":"Длительность окна антидребезга в миллисекундах"},"since":{"type":"number","minimum":0,"description":"Unix timestamp (мс) начала окна антидребезга; 0, если окно неактивно"}}};const schema39 = {"type":"object","required":["origin","title","count","active","updatedAt","lastSeenAt","heartbeat"],"additionalProperties":false,"properties":{"origin":{"type":"string","format":"uri","description":"URL вкладки Codex"},"title":{"type":"string","minLength":1,"description":"Отображаемое название вкладки"},"count":{"type":"integer","minimum":0,"description":"Количество активных задач, присоединённых к вкладке"},"active":{"type":"boolean","description":"Признак наличия активности по мнению контент-скрипта"},"updatedAt":{"type":"number","description":"Unix timestamp (мс) последнего обновления состояния вкладки"},"lastSeenAt":{"type":"number","description":"Unix timestamp (мс) последнего полученного сообщения (`TASKS_UPDATE` или `TASKS_HEARTBEAT`)"},"heartbeat":{"$ref":"#/definitions/heartbeatState"},"signals":{"type":"array","items":{"$ref":"#/definitions/tabSignal"}}}};const schema40 = {"type":"object","required":["lastReceivedAt","expectedIntervalMs","status","missedCount"],"additionalProperties":false,"properties":{"lastReceivedAt":{"type":"number","minimum":0,"description":"Unix timestamp (мс) последнего heartbeat"},"expectedIntervalMs":{"type":"integer","minimum":1000,"maximum":60000,"description":"Ожидаемый интервал между heartbeat (мс)"},"status":{"type":"string","enum":["OK","STALE"],"description":"Текущий статус heartbeat для вкладки"},"missedCount":{"type":"integer","minimum":0,"description":"Сколько раз подряд ожидание heartbeat было нарушено"}}};const formats0 = formatUri;const func1 = unicodeLength;const schema41 = {"allOf":[{"$ref":"../dto/content-update.schema.json#/definitions/signal"}]};const schema33 = {"type":"object","required":["detector","evidence"],"additionalProperties":false,"properties":{"detector":{"type":"string","enum":["D1_SPINNER","D2_STOP_BUTTON","D3_CARD_HEUR","D4_TASK_COUNTER"],"description":"Идентификатор сработавшего детектора"},"evidence":{"type":"string","minLength":1,"description":"Краткое описание или CSS-селектор обнаруженного элемента"},"taskKey":{"type":"string","minLength":1,"description":"Уникальный ключ задачи (если доступен)"}}};function validate28(data: any, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}: { instancePath?: string; parentData?: any; parentDataProperty?: any; rootData?: any; dynamicAnchors?: Record<string, unknown> } = {}){let vErrors = null;let errors = 0;const evaluated0 = validate28.evaluated;if(evaluated0.dynamicProps){evaluated0.props = undefined;}if(evaluated0.dynamicItems){evaluated0.items = undefined;}if(data && typeof data == "object" && !Array.isArray(data)){if(data.detector === undefined){const err0 = {instancePath,schemaPath:"../dto/content-update.schema.json#/definitions/signal/required",keyword:"required",params:{missingProperty: "detector"},message:"must have required property '"+"detector"+"'"};if(vErrors === null){vErrors = [err0];}else {vErrors.push(err0);}errors++;}if(data.evidence === undefined){const err1 = {instancePath,schemaPath:"../dto/content-update.schema.json#/definitions/signal/required",keyword:"required",params:{missingProperty: "evidence"},message:"must have required property '"+"evidence"+"'"};if(vErrors === null){vErrors = [err1];}else {vErrors.push(err1);}errors++;}for(const key0 in data){if(!(((key0 === "detector") || (key0 === "evidence")) || (key0 === "taskKey"))){const err2 = {instancePath,schemaPath:"../dto/content-update.schema.json#/definitions/signal/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};if(vErrors === null){vErrors = [err2];}else {vErrors.push(err2);}errors++;}}if(data.detector !== undefined){let data0 = data.detector;if(typeof data0 !== "string"){const err3 = {instancePath:instancePath+"/detector",schemaPath:"../dto/content-update.schema.json#/definitions/signal/properties/detector/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err3];}else {vErrors.push(err3);}errors++;}if(!((((data0 === "D1_SPINNER") || (data0 === "D2_STOP_BUTTON")) || (data0 === "D3_CARD_HEUR")) || (data0 === "D4_TASK_COUNTER"))){const err4 = {instancePath:instancePath+"/detector",schemaPath:"../dto/content-update.schema.json#/definitions/signal/properties/detector/enum",keyword:"enum",params:{allowedValues: schema33.properties.detector.enum},message:"must be equal to one of the allowed values"};if(vErrors === null){vErrors = [err4];}else {vErrors.push(err4);}errors++;}}if(data.evidence !== undefined){let data1 = data.evidence;if(typeof data1 === "string"){if(func1(data1) < 1){const err5 = {instancePath:instancePath+"/evidence",schemaPath:"../dto/content-update.schema.json#/definitions/signal/properties/evidence/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};if(vErrors === null){vErrors = [err5];}else {vErrors.push(err5);}errors++;}}else {const err6 = {instancePath:instancePath+"/evidence",schemaPath:"../dto/content-update.schema.json#/definitions/signal/properties/evidence/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err6];}else {vErrors.push(err6);}errors++;}}if(data.taskKey !== undefined){let data2 = data.taskKey;if(typeof data2 === "string"){if(func1(data2) < 1){const err7 = {instancePath:instancePath+"/taskKey",schemaPath:"../dto/content-update.schema.json#/definitions/signal/properties/taskKey/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};if(vErrors === null){vErrors = [err7];}else {vErrors.push(err7);}errors++;}}else {const err8 = {instancePath:instancePath+"/taskKey",schemaPath:"../dto/content-update.schema.json#/definitions/signal/properties/taskKey/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err8];}else {vErrors.push(err8);}errors++;}}}else {const err9 = {instancePath,schemaPath:"../dto/content-update.schema.json#/definitions/signal/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err9];}else {vErrors.push(err9);}errors++;}validate28.errors = vErrors;return errors === 0;}validate28.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};function validate27(data: any, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}: { instancePath?: string; parentData?: any; parentDataProperty?: any; rootData?: any; dynamicAnchors?: Record<string, unknown> } = {}){let vErrors = null;let errors = 0;const evaluated0 = validate27.evaluated;if(evaluated0.dynamicProps){evaluated0.props = undefined;}if(evaluated0.dynamicItems){evaluated0.items = undefined;}if(data && typeof data == "object" && !Array.isArray(data)){if(data.origin === undefined){const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "origin"},message:"must have required property '"+"origin"+"'"};if(vErrors === null){vErrors = [err0];}else {vErrors.push(err0);}errors++;}if(data.title === undefined){const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};if(vErrors === null){vErrors = [err1];}else {vErrors.push(err1);}errors++;}if(data.count === undefined){const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "count"},message:"must have required property '"+"count"+"'"};if(vErrors === null){vErrors = [err2];}else {vErrors.push(err2);}errors++;}if(data.active === undefined){const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "active"},message:"must have required property '"+"active"+"'"};if(vErrors === null){vErrors = [err3];}else {vErrors.push(err3);}errors++;}if(data.updatedAt === undefined){const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};if(vErrors === null){vErrors = [err4];}else {vErrors.push(err4);}errors++;}if(data.lastSeenAt === undefined){const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "lastSeenAt"},message:"must have required property '"+"lastSeenAt"+"'"};if(vErrors === null){vErrors = [err5];}else {vErrors.push(err5);}errors++;}if(data.heartbeat === undefined){const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "heartbeat"},message:"must have required property '"+"heartbeat"+"'"};if(vErrors === null){vErrors = [err6];}else {vErrors.push(err6);}errors++;}for(const key0 in data){if(!((((((((key0 === "origin") || (key0 === "title")) || (key0 === "count")) || (key0 === "active")) || (key0 === "updatedAt")) || (key0 === "lastSeenAt")) || (key0 === "heartbeat")) || (key0 === "signals"))){const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};if(vErrors === null){vErrors = [err7];}else {vErrors.push(err7);}errors++;}}if(data.origin !== undefined){let data0 = data.origin;if(typeof data0 === "string"){if(!(formats0(data0))){const err8 = {instancePath:instancePath+"/origin",schemaPath:"#/properties/origin/format",keyword:"format",params:{format: "uri"},message:"must match format \""+"uri"+"\""};if(vErrors === null){vErrors = [err8];}else {vErrors.push(err8);}errors++;}}else {const err9 = {instancePath:instancePath+"/origin",schemaPath:"#/properties/origin/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err9];}else {vErrors.push(err9);}errors++;}}if(data.title !== undefined){let data1 = data.title;if(typeof data1 === "string"){if(func1(data1) < 1){const err10 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};if(vErrors === null){vErrors = [err10];}else {vErrors.push(err10);}errors++;}}else {const err11 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err11];}else {vErrors.push(err11);}errors++;}}if(data.count !== undefined){let data2 = data.count;if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){const err12 = {instancePath:instancePath+"/count",schemaPath:"#/properties/count/type",keyword:"type",params:{type: "integer"},message:"must be integer"};if(vErrors === null){vErrors = [err12];}else {vErrors.push(err12);}errors++;}if((typeof data2 == "number") && (isFinite(data2))){if(data2 < 0 || isNaN(data2)){const err13 = {instancePath:instancePath+"/count",schemaPath:"#/properties/count/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};if(vErrors === null){vErrors = [err13];}else {vErrors.push(err13);}errors++;}}}if(data.active !== undefined){if(typeof data.active !== "boolean"){const err14 = {instancePath:instancePath+"/active",schemaPath:"#/properties/active/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};if(vErrors === null){vErrors = [err14];}else {vErrors.push(err14);}errors++;}}if(data.updatedAt !== undefined){let data4 = data.updatedAt;if(!((typeof data4 == "number") && (isFinite(data4)))){const err15 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/properties/updatedAt/type",keyword:"type",params:{type: "number"},message:"must be number"};if(vErrors === null){vErrors = [err15];}else {vErrors.push(err15);}errors++;}}if(data.lastSeenAt !== undefined){let data5 = data.lastSeenAt;if(!((typeof data5 == "number") && (isFinite(data5)))){const err16 = {instancePath:instancePath+"/lastSeenAt",schemaPath:"#/properties/lastSeenAt/type",keyword:"type",params:{type: "number"},message:"must be number"};if(vErrors === null){vErrors = [err16];}else {vErrors.push(err16);}errors++;}}if(data.heartbeat !== undefined){let data6 = data.heartbeat;if(data6 && typeof data6 == "object" && !Array.isArray(data6)){if(data6.lastReceivedAt === undefined){const err17 = {instancePath:instancePath+"/heartbeat",schemaPath:"#/definitions/heartbeatState/required",keyword:"required",params:{missingProperty: "lastReceivedAt"},message:"must have required property '"+"lastReceivedAt"+"'"};if(vErrors === null){vErrors = [err17];}else {vErrors.push(err17);}errors++;}if(data6.expectedIntervalMs === undefined){const err18 = {instancePath:instancePath+"/heartbeat",schemaPath:"#/definitions/heartbeatState/required",keyword:"required",params:{missingProperty: "expectedIntervalMs"},message:"must have required property '"+"expectedIntervalMs"+"'"};if(vErrors === null){vErrors = [err18];}else {vErrors.push(err18);}errors++;}if(data6.status === undefined){const err19 = {instancePath:instancePath+"/heartbeat",schemaPath:"#/definitions/heartbeatState/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};if(vErrors === null){vErrors = [err19];}else {vErrors.push(err19);}errors++;}if(data6.missedCount === undefined){const err20 = {instancePath:instancePath+"/heartbeat",schemaPath:"#/definitions/heartbeatState/required",keyword:"required",params:{missingProperty: "missedCount"},message:"must have required property '"+"missedCount"+"'"};if(vErrors === null){vErrors = [err20];}else {vErrors.push(err20);}errors++;}for(const key1 in data6){if(!((((key1 === "lastReceivedAt") || (key1 === "expectedIntervalMs")) || (key1 === "status")) || (key1 === "missedCount"))){const err21 = {instancePath:instancePath+"/heartbeat",schemaPath:"#/definitions/heartbeatState/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};if(vErrors === null){vErrors = [err21];}else {vErrors.push(err21);}errors++;}}if(data6.lastReceivedAt !== undefined){let data7 = data6.lastReceivedAt;if((typeof data7 == "number") && (isFinite(data7))){if(data7 < 0 || isNaN(data7)){const err22 = {instancePath:instancePath+"/heartbeat/lastReceivedAt",schemaPath:"#/definitions/heartbeatState/properties/lastReceivedAt/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};if(vErrors === null){vErrors = [err22];}else {vErrors.push(err22);}errors++;}}else {const err23 = {instancePath:instancePath+"/heartbeat/lastReceivedAt",schemaPath:"#/definitions/heartbeatState/properties/lastReceivedAt/type",keyword:"type",params:{type: "number"},message:"must be number"};if(vErrors === null){vErrors = [err23];}else {vErrors.push(err23);}errors++;}}if(data6.expectedIntervalMs !== undefined){let data8 = data6.expectedIntervalMs;if(!(((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8))) && (isFinite(data8)))){const err24 = {instancePath:instancePath+"/heartbeat/expectedIntervalMs",schemaPath:"#/definitions/heartbeatState/properties/expectedIntervalMs/type",keyword:"type",params:{type: "integer"},message:"must be integer"};if(vErrors === null){vErrors = [err24];}else {vErrors.push(err24);}errors++;}if((typeof data8 == "number") && (isFinite(data8))){if(data8 > 60000 || isNaN(data8)){const err25 = {instancePath:instancePath+"/heartbeat/expectedIntervalMs",schemaPath:"#/definitions/heartbeatState/properties/expectedIntervalMs/maximum",keyword:"maximum",params:{comparison: "<=", limit: 60000},message:"must be <= 60000"};if(vErrors === null){vErrors = [err25];}else {vErrors.push(err25);}errors++;}if(data8 < 1000 || isNaN(data8)){const err26 = {instancePath:instancePath+"/heartbeat/expectedIntervalMs",schemaPath:"#/definitions/heartbeatState/properties/expectedIntervalMs/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1000},message:"must be >= 1000"};if(vErrors === null){vErrors = [err26];}else {vErrors.push(err26);}errors++;}}}if(data6.status !== undefined){let data9 = data6.status;if(typeof data9 !== "string"){const err27 = {instancePath:instancePath+"/heartbeat/status",schemaPath:"#/definitions/heartbeatState/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};if(vErrors === null){vErrors = [err27];}else {vErrors.push(err27);}errors++;}if(!((data9 === "OK") || (data9 === "STALE"))){const err28 = {instancePath:instancePath+"/heartbeat/status",schemaPath:"#/definitions/heartbeatState/properties/status/enum",keyword:"enum",params:{allowedValues: schema40.properties.status.enum},message:"must be equal to one of the allowed values"};if(vErrors === null){vErrors = [err28];}else {vErrors.push(err28);}errors++;}}if(data6.missedCount !== undefined){let data10 = data6.missedCount;if(!(((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10))) && (isFinite(data10)))){const err29 = {instancePath:instancePath+"/heartbeat/missedCount",schemaPath:"#/definitions/heartbeatState/properties/missedCount/type",keyword:"type",params:{type: "integer"},message:"must be integer"};if(vErrors === null){vErrors = [err29];}else {vErrors.push(err29);}errors++;}if((typeof data10 == "number") && (isFinite(data10))){if(data10 < 0 || isNaN(data10)){const err30 = {instancePath:instancePath+"/heartbeat/missedCount",schemaPath:"#/definitions/heartbeatState/properties/missedCount/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};if(vErrors === null){vErrors = [err30];}else {vErrors.push(err30);}errors++;}}}}else {const err31 = {instancePath:instancePath+"/heartbeat",schemaPath:"#/definitions/heartbeatState/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err31];}else {vErrors.push(err31);}errors++;}}if(data.signals !== undefined){let data11 = data.signals;if(Array.isArray(data11)){const len0 = data11.length;for(let i0=0; i0<len0; i0++){if(!(validate28(data11[i0], {instancePath:instancePath+"/signals/" + i0,parentData:data11,parentDataProperty:i0,rootData,dynamicAnchors}))){vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);errors = vErrors.length;}}}else {const err32 = {instancePath:instancePath+"/signals",schemaPath:"#/properties/signals/type",keyword:"type",params:{type: "array"},message:"must be array"};if(vErrors === null){vErrors = [err32];}else {vErrors.push(err32);}errors++;}}}else {const err33 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err33];}else {vErrors.push(err33);}errors++;}validate27.errors = vErrors;return errors === 0;}validate27.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};function validate26(data: any, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}: { instancePath?: string; parentData?: any; parentDataProperty?: any; rootData?: any; dynamicAnchors?: Record<string, unknown> } = {}){/*# sourceURL="https://codex.tasks/contracts/state/aggregated-state.schema.json" */;let vErrors = null;let errors = 0;const evaluated0 = validate26.evaluated;if(evaluated0.dynamicProps){evaluated0.props = undefined;}if(evaluated0.dynamicItems){evaluated0.items = undefined;}if(data && typeof data == "object" && !Array.isArray(data)){if(data.tabs === undefined){const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "tabs"},message:"must have required property '"+"tabs"+"'"};if(vErrors === null){vErrors = [err0];}else {vErrors.push(err0);}errors++;}if(data.lastTotal === undefined){const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "lastTotal"},message:"must have required property '"+"lastTotal"+"'"};if(vErrors === null){vErrors = [err1];}else {vErrors.push(err1);}errors++;}if(data.debounce === undefined){const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "debounce"},message:"must have required property '"+"debounce"+"'"};if(vErrors === null){vErrors = [err2];}else {vErrors.push(err2);}errors++;}for(const key0 in data){if(!(((key0 === "tabs") || (key0 === "lastTotal")) || (key0 === "debounce"))){const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};if(vErrors === null){vErrors = [err3];}else {vErrors.push(err3);}errors++;}}if(data.tabs !== undefined){let data0 = data.tabs;if(data0 && typeof data0 == "object" && !Array.isArray(data0)){for(const key1 in data0){if(!(validate27(data0[key1], {instancePath:instancePath+"/tabs/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),parentData:data0,parentDataProperty:key1,rootData,dynamicAnchors}))){vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);errors = vErrors.length;}}}else {const err4 = {instancePath:instancePath+"/tabs",schemaPath:"#/properties/tabs/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err4];}else {vErrors.push(err4);}errors++;}}if(data.lastTotal !== undefined){let data2 = data.lastTotal;if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){const err5 = {instancePath:instancePath+"/lastTotal",schemaPath:"#/properties/lastTotal/type",keyword:"type",params:{type: "integer"},message:"must be integer"};if(vErrors === null){vErrors = [err5];}else {vErrors.push(err5);}errors++;}if((typeof data2 == "number") && (isFinite(data2))){if(data2 < 0 || isNaN(data2)){const err6 = {instancePath:instancePath+"/lastTotal",schemaPath:"#/properties/lastTotal/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};if(vErrors === null){vErrors = [err6];}else {vErrors.push(err6);}errors++;}}}if(data.debounce !== undefined){let data3 = data.debounce;if(data3 && typeof data3 == "object" && !Array.isArray(data3)){if(data3.ms === undefined){const err7 = {instancePath:instancePath+"/debounce",schemaPath:"#/definitions/debounceState/required",keyword:"required",params:{missingProperty: "ms"},message:"must have required property '"+"ms"+"'"};if(vErrors === null){vErrors = [err7];}else {vErrors.push(err7);}errors++;}if(data3.since === undefined){const err8 = {instancePath:instancePath+"/debounce",schemaPath:"#/definitions/debounceState/required",keyword:"required",params:{missingProperty: "since"},message:"must have required property '"+"since"+"'"};if(vErrors === null){vErrors = [err8];}else {vErrors.push(err8);}errors++;}for(const key2 in data3){if(!((key2 === "ms") || (key2 === "since"))){const err9 = {instancePath:instancePath+"/debounce",schemaPath:"#/definitions/debounceState/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};if(vErrors === null){vErrors = [err9];}else {vErrors.push(err9);}errors++;}}if(data3.ms !== undefined){let data4 = data3.ms;if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){const err10 = {instancePath:instancePath+"/debounce/ms",schemaPath:"#/definitions/debounceState/properties/ms/type",keyword:"type",params:{type: "integer"},message:"must be integer"};if(vErrors === null){vErrors = [err10];}else {vErrors.push(err10);}errors++;}if((typeof data4 == "number") && (isFinite(data4))){if(data4 > 60000 || isNaN(data4)){const err11 = {instancePath:instancePath+"/debounce/ms",schemaPath:"#/definitions/debounceState/properties/ms/maximum",keyword:"maximum",params:{comparison: "<=", limit: 60000},message:"must be <= 60000"};if(vErrors === null){vErrors = [err11];}else {vErrors.push(err11);}errors++;}if(data4 < 0 || isNaN(data4)){const err12 = {instancePath:instancePath+"/debounce/ms",schemaPath:"#/definitions/debounceState/properties/ms/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};if(vErrors === null){vErrors = [err12];}else {vErrors.push(err12);}errors++;}}}if(data3.since !== undefined){let data5 = data3.since;if((typeof data5 == "number") && (isFinite(data5))){if(data5 < 0 || isNaN(data5)){const err13 = {instancePath:instancePath+"/debounce/since",schemaPath:"#/definitions/debounceState/properties/since/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};if(vErrors === null){vErrors = [err13];}else {vErrors.push(err13);}errors++;}}else {const err14 = {instancePath:instancePath+"/debounce/since",schemaPath:"#/definitions/debounceState/properties/since/type",keyword:"type",params:{type: "number"},message:"must be number"};if(vErrors === null){vErrors = [err14];}else {vErrors.push(err14);}errors++;}}}else {const err15 = {instancePath:instancePath+"/debounce",schemaPath:"#/definitions/debounceState/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err15];}else {vErrors.push(err15);}errors++;}}}else {const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};if(vErrors === null){vErrors = [err16];}else {vErrors.push(err16);}errors++;}validate26.errors = vErrors;return errors === 0;}validate26.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};
  return validate26 as ValidateFunction<AggregatedTabsState>;
})();

export function validateAggregatedTabsState(value: unknown): value is AggregatedTabsState {
  return (validateAggregatedTabsStateFn(value) as boolean);
}

export function assertAggregatedTabsState(value: unknown): asserts value is AggregatedTabsState {
  if (!validateAggregatedTabsState(value)) {
    throw new ContractValidationError('AggregatedTabsState', validateAggregatedTabsStateFn.errors ?? []);
  }
}


export const contractRegistry = {
  'ContentScriptHeartbeat': { schema: contentScriptHeartbeatSchema, validate: validateContentScriptHeartbeat, assert: assertContentScriptHeartbeat },
  'ContentScriptTasksUpdate': { schema: contentScriptTasksUpdateSchema, validate: validateContentScriptTasksUpdate, assert: assertContentScriptTasksUpdate },
  'PopupRenderState': { schema: popupRenderStateSchema, validate: validatePopupRenderState, assert: assertPopupRenderState },
  'CodexTasksUserSettings': { schema: codexTasksUserSettingsSchema, validate: validateCodexTasksUserSettings, assert: assertCodexTasksUserSettings },
  'AggregatedTabsState': { schema: aggregatedTabsStateSchema, validate: validateAggregatedTabsState, assert: assertAggregatedTabsState },
} as const;

type ExtractAssertedType<T> = T extends (value: unknown) => asserts value is infer R ? R : never;
export type ContractType = keyof typeof contractRegistry;

export function getContractDescriptor<T extends ContractType>(
  type: T,
): ContractDescriptor<ExtractAssertedType<(typeof contractRegistry)[T]['assert']>> {
  return contractRegistry[type] as ContractDescriptor<ExtractAssertedType<(typeof contractRegistry)[T]['assert']>>;
}
