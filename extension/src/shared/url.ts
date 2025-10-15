export function normalizePathname(pathname: string | null | undefined): string {
  if (!pathname) {
    return '/';
  }
  if (pathname === '/') {
    return pathname;
  }
  return pathname.replace(/\/+$/, '') || '/';
}

export function isCodexTasksListingPath(normalizedPathname: string): boolean {
  return normalizedPathname === '/codex';
}

export function isCodexTaskDetailsPath(normalizedPathname: string): boolean {
  if (!normalizedPathname.startsWith('/codex')) {
    return false;
  }
  if (normalizedPathname === '/codex') {
    return false;
  }
  return normalizedPathname.startsWith('/codex/tasks');
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
