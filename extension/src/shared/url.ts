export function normalizePathname(pathname: string | null | undefined): string {
  if (!pathname) {
    return '/';
  }
  if (pathname === '/') {
    return pathname;
  }
  return pathname.replace(/\/+$/, '') || '/';
}

const TASK_LISTING_PATHS = new Set(['/codex']);

export type MainCodexListingTab = 'all' | 'code_reviews';

const MAIN_LISTING_TAB_VALUES = new Map<string, MainCodexListingTab>([
  ['', 'all'],
  ['all', 'all'],
  ['code_reviews', 'code_reviews'],
]);

export function isCodexTasksListingPath(normalizedPathname: string): boolean {
  return TASK_LISTING_PATHS.has(normalizedPathname);
}

export function isCodexTaskDetailsPath(normalizedPathname: string): boolean {
  if (!normalizedPathname.startsWith('/codex/')) {
    return false;
  }
  const segments = normalizedPathname.split('/').filter((segment) => segment.length > 0);
  if (segments.length < 3) {
    return false;
  }
  if (segments[0] !== 'codex') {
    return false;
  }
  return segments[1] === 'tasks';
}

export interface CanonicalCodexLocation {
  readonly canonical: string;
  readonly normalizedPathname: string;
  readonly isTasksListing: boolean;
  readonly isTaskDetails: boolean;
}

export function canonicalizeCodexUrl(href: string): CanonicalCodexLocation | undefined {
  try {
    const parsed = new URL(href);
    const normalizedPathname = normalizePathname(parsed.pathname);
    return {
      canonical: `${parsed.origin}${normalizedPathname}`,
      normalizedPathname,
      isTasksListing: isCodexTasksListingPath(normalizedPathname),
      isTaskDetails: isCodexTaskDetailsPath(normalizedPathname),
    };
  } catch (error) {
    console.warn('failed to canonicalize url', { href, error });
    return undefined;
  }
}

function safeParseUrl(href: string): URL | undefined {
  try {
    return new URL(href);
  } catch (error) {
    console.warn('failed to parse url while matching Codex listing', { href, error });
    return undefined;
  }
}

export function resolveMainCodexListingTab(href: string): MainCodexListingTab | undefined {
  const parsed = safeParseUrl(href);
  if (!parsed) {
    return undefined;
  }

  const normalizedPathname = normalizePathname(parsed.pathname);
  if (!isCodexTasksListingPath(normalizedPathname)) {
    return undefined;
  }

  const tabParam = parsed.searchParams.get('tab');
  if (!tabParam) {
    return 'all';
  }

  const normalizedTab = tabParam.trim().toLowerCase();
  return MAIN_LISTING_TAB_VALUES.get(normalizedTab);
}

export function isMainCodexListingUrl(href: string): boolean {
  return resolveMainCodexListingTab(href) !== undefined;
}
