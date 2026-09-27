import { ValidationError } from './errors.js';

/**
 * SSRF policy for fetching a USER-SUPPLIED URL (shared kernel — pure, no I/O).
 *
 * The server fetches skill files on the user's behalf, so a URL must never let
 * a caller reach the API host's own network: loopback, RFC 1918, link-local
 * (cloud metadata at 169.254.169.254), CGNAT, multicast, documentation ranges,
 * and their IPv6 / IPv4-mapped forms are all refused. `assertFetchableUrl`
 * checks the URL itself; the HTTP adapter additionally runs `isPrivateAddress`
 * on every address DNS returns and on every redirect hop, so a public name
 * that resolves (or redirects) to a private address is refused too.
 */

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

/** Parse, then refuse anything but a plain public https URL. */
export function assertFetchableUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = typeof raw === 'string' ? new URL(raw) : raw;
  } catch {
    throw new ValidationError('Not a valid URL');
  }
  if (url.protocol !== 'https:') throw new ValidationError('Only https:// URLs can be imported');
  if (url.username || url.password) throw new ValidationError('URLs with credentials are not allowed');
  if (url.port && url.port !== '443') throw new ValidationError('Only the default https port is allowed');
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new ValidationError('That host is not reachable from here');
  }
  const literal = host.startsWith('[') ? host.slice(1, -1) : host;
  if (isIpLiteral(literal) && isPrivateAddress(literal)) {
    throw new ValidationError('URLs pointing at private or local addresses are not allowed');
  }
  return url;
}

function isIpLiteral(host: string): boolean {
  return parseIPv4(host) !== null || host.includes(':');
}

function parseIPv4(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  return octets.every((o) => o <= 255) ? octets : null;
}

function isPrivateIPv4([a, b, c]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a! >= 224 // multicast + reserved + broadcast
  );
}

/** Expand an IPv6 string to 8 hextets (numbers); null when unparseable. */
function parseIPv6(raw: string): number[] | null {
  let ip = raw.toLowerCase().split('%')[0]!;
  // Trailing embedded IPv4 (::ffff:1.2.3.4) → two hextets.
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (v4) {
    const o = parseIPv4(v4[1]!);
    if (!o) return null;
    ip = ip.slice(0, -v4[1]!.length) + `${((o[0]! << 8) | o[1]!).toString(16)}:${((o[2]! << 8) | o[3]!).toString(16)}`;
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

/** True for any address a server-side fetch must not reach (unparseable → true). */
export function isPrivateAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isPrivateIPv4(v4);
  const h = parseIPv6(ip);
  if (!h) return true;
  const allZeroUntil = (n: number) => h.slice(0, n).every((x) => x === 0);
  // ::ffff:a.b.c.d (mapped) and 64:ff9b::a.b.c.d (NAT64) carry an IPv4 inside.
  const nat64 = h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0);
  if ((allZeroUntil(5) && h[5] === 0xffff) || nat64) {
    return isPrivateIPv4([h[6]! >> 8, h[6]! & 0xff, h[7]! >> 8, h[7]! & 0xff]);
  }
  if (allZeroUntil(7)) return true; // :: and ::1
  const first = h[0]!;
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique-local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // multicast
    (first === 0x2001 && h[1] === 0x0db8) // documentation
  );
}
