import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import {
  assertAggregatedTabsState,
  assertContentScriptHeartbeat,
  assertContentScriptTasksUpdate,
  type ContentScriptHeartbeat,
  type ContentScriptTasksUpdate,
} from '@/shared/contracts';
import type { ChromeLike } from '@/shared/chrome';
import type { BackgroundAggregator } from '@/background/aggregator';
import { generatePopupRenderState } from '@/background/popup-state';

interface AdapterOptions {
  readonly chrome: ChromeLike;
  readonly aggregator: BackgroundAggregator;
  readonly tabId: number;
  readonly tabTitle: string;
  readonly tabUrl?: string;
}

export interface TestHttpAdapter {
  readonly url: string;
  readonly close: () => Promise<void>;
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return {} as T;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T;
  } catch (error) {
    throw new Error('Invalid JSON payload');
  }
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const data = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.setHeader('content-length', Buffer.byteLength(data));
  response.end(data);
}

export async function startTestHttpAdapter(options: AdapterOptions): Promise<TestHttpAdapter> {
  const { aggregator, chrome, tabId, tabTitle } = options;
  const tabUrl = options.tabUrl ?? 'https://codex.openai.com';

  const server = createServer(async (request, response) => {
    if (!request.url || !request.method) {
      sendJson(response, 404, { status: 'not-found' });
      return;
    }
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'POST' && url.pathname === '/background/tasks-update') {
        const payload = await readJson<ContentScriptTasksUpdate>(request);
        assertContentScriptTasksUpdate(payload);
        await aggregator.handleTasksUpdate(payload, {
          tab: { id: tabId, title: tabTitle, url: tabUrl },
        } as chrome.runtime.MessageSender);
        sendJson(response, 202, { status: 'accepted' });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/background/tasks-heartbeat') {
        const payload = await readJson<ContentScriptHeartbeat>(request);
        assertContentScriptHeartbeat(payload);
        await aggregator.handleHeartbeat(payload, {
          tab: { id: tabId, title: tabTitle, url: tabUrl },
        } as chrome.runtime.MessageSender);
        sendJson(response, 202, { status: 'accepted' });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/background/state') {
        const snapshot = await aggregator.getSnapshot();
        assertAggregatedTabsState(snapshot);
        sendJson(response, 200, snapshot);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/popup/state') {
        const state = await generatePopupRenderState(aggregator, { chrome });
        sendJson(response, 200, state);
        return;
      }
      sendJson(response, 404, { status: 'not-found' });
    } catch (error) {
      if (error && typeof error === 'object' && 'errors' in error) {
        const { errors } = error as { errors?: unknown };
        sendJson(response, 400, { status: 'invalid', errors });
        return;
      }
      sendJson(response, 500, { status: 'error', message: (error as Error).message });
    }
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error('Failed to start HTTP adapter');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close();
      await once(server, 'close');
    },
  };
}
