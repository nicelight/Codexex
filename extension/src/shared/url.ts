export function normalizePathname(pathname: string | null | undefined): string {
  if (!pathname) {
    return '/';
  }
  if (pathname === '/') {
    return pathname;
  }
  return pathname.replace(/\/+$/, '') || '/';
}

const TASK_LISTING_PATHS = new Set(['/codex', '/plan']);

export function isCodexTasksListingPath(normalizedPathname: string): boolean {
  if (TASK_LISTING_PATHS.has(normalizedPathname)) {
    return true;
  }
  return false;
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
