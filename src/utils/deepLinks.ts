const PUBLIC_ROUTE_PATTERNS = [/^\/event\/[^/]+$/, /^\/schedule\/[^/]+$/];

const STANDALONE_HEADER_PATTERNS = [
  ...PUBLIC_ROUTE_PATTERNS,
  /^\/notification-event\/[^/]+$/,
  /^\/schedule\/create$/,
  /^\/schedule\/edit\/[^/]+$/,
  /^\/bookings$/,
];

function normalizePathname(pathname: string) {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function matchesRoutePattern(pathname: string, patterns: RegExp[]) {
  const normalized = normalizePathname(pathname);
  return patterns.some((pattern) => pattern.test(normalized));
}

export function isPublicAppPath(pathname: string) {
  return matchesRoutePattern(pathname, PUBLIC_ROUTE_PATTERNS);
}

export function usesStandaloneHeader(pathname: string) {
  return matchesRoutePattern(pathname, STANDALONE_HEADER_PATTERNS);
}

export function extractAppRouteFromUrl(url: string) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const candidates = [
      normalizePathname(parsed.pathname),
      normalizePathname(`/${parsed.host}${parsed.pathname}`),
    ];

    for (const candidate of candidates) {
      if (isPublicAppPath(candidate)) {
        return `${candidate}${parsed.search}${parsed.hash}`;
      }
    }
  } catch {
    if (url.startsWith("/")) {
      const [pathname] = url.split(/[?#]/, 1);
      if (isPublicAppPath(pathname)) {
        return url;
      }
    }
  }

  return null;
}
