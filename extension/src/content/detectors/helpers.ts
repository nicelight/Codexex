import type { ChromeLogger } from '../../shared/chrome';

export function detectLocale(documentRef: Document): 'en' | 'ru' {
  const documentLang = documentRef.documentElement.lang?.trim().toLowerCase();
  if (documentLang?.startsWith('ru')) {
    return 'ru';
  }
  const navigatorLang = documentRef.defaultView?.navigator.language?.toLowerCase();
  if (navigatorLang?.startsWith('ru')) {
    return 'ru';
  }
  return 'en';
}

export function elementEvidence(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classList = Array.from(element.classList || [])
    .slice(0, 3)
    .map((className) => `.${className}`)
    .join('');
  return `${tag}${id}${classList}` || tag;
}

export function collectElements(
  root: Element | Document,
  selectors: readonly string[],
): Element[] {
  const results: Element[] = [];
  for (const selector of selectors) {
    const nodeList = root.querySelectorAll(selector);
    results.push(...Array.from(nodeList));
  }
  return results;
}

export function logDetectorResult(
  logger: ChromeLogger,
  detectorId: string,
  active: boolean,
  count: number,
  evidences: readonly string[],
): void {
  logger.debug(
    `${detectorId} scan`,
    JSON.stringify({ active, count, evidences }),
  );
}
