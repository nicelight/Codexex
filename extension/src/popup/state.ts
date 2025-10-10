import {
  assertPopupRenderState,
  type PopupRenderState,
} from '../shared/contracts';
import { resolveChrome } from '../shared/chrome';

export async function requestPopupState(): Promise<PopupRenderState> {
  const chrome = resolveChrome();
  return new Promise<PopupRenderState>((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type: 'POPUP_GET_STATE' }, (response?: unknown) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        try {
          assertPopupRenderState(response);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
