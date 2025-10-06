import { ContentScriptRuntime } from './runtime';

let runtime: ContentScriptRuntime | undefined;

export async function bootstrapContentScript(): Promise<void> {
  if (runtime) {
    return;
  }
  runtime = new ContentScriptRuntime({ window });
  await runtime.start();
}

void bootstrapContentScript();
