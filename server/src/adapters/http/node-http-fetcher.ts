/**
 * http adapter — the `HttpFetcher` port over `node:https` (no extra deps).
 *
 * SSRF defenses, in order:
 *   1. `assertFetchableUrl` on the URL and on EVERY redirect hop (https only,
 *      no credentials, no odd ports, no local hostnames / private IP literals).
 *   2. A custom `lookup`: every address DNS returns must be public, and the
 *      socket connects to exactly the address that was checked — so a name
 *      can't pass the check and then rebind to 127.0.0.1 for the connect.
 *   3. Redirects are followed manually (capped); bodies are capped by bytes
 *      while streaming, and the whole request by a timeout.
 */
import https from 'node:https';
import dns from 'node:dns';
import type { LookupFunction } from 'node:net';
import type { HttpFetcher, HttpFetchOptions, HttpFetchResult } from '@devdigest/shared';
import { ExternalServiceError, ValidationError } from '../../platform/errors.js';
import { assertFetchableUrl, isPrivateAddress } from '../../platform/url-safety.js';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = 'devdigest-skill-import/1.0';

/** DNS lookup that refuses (and never connects to) a private address. */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 4);
    const list = addresses as dns.LookupAddress[];
    const blocked = list.find((a) => isPrivateAddress(a.address));
    if (blocked || list.length === 0) {
      return callback(new ValidationError('That host resolves to a private or local address'), '', 4);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
};

interface RawResponse {
  status: number;
  location: string | null;
  contentType: string | null;
  body: Uint8Array;
}

export class NodeHttpFetcher implements HttpFetcher {
  async fetch(url: string, opts: HttpFetchOptions): Promise<HttpFetchResult> {
    let current = assertFetchableUrl(url);
    for (let hop = 0; ; hop++) {
      const res = await this.get(current, opts);
      if (REDIRECT_STATUSES.has(res.status) && res.location) {
        if (hop >= opts.maxRedirects) throw new ExternalServiceError('Too many redirects');
        current = assertFetchableUrl(new URL(res.location, current));
        continue;
      }
      return { url: current.toString(), status: res.status, contentType: res.contentType, body: res.body };
    }
  }

  private get(url: URL, opts: HttpFetchOptions): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          lookup: publicOnlyLookup,
          timeout: opts.timeoutMs,
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/markdown, text/plain;q=0.9, application/zip;q=0.8, */*;q=0.1',
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const location = typeof res.headers.location === 'string' ? res.headers.location : null;
          const contentType = res.headers['content-type'] ?? null;
          if (REDIRECT_STATUSES.has(status)) {
            res.resume();
            return resolve({ status, location, contentType, body: new Uint8Array() });
          }
          const declared = Number(res.headers['content-length'] ?? 0);
          if (declared > opts.maxBytes) {
            res.destroy();
            return reject(tooLarge(opts.maxBytes));
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > opts.maxBytes) {
              res.destroy();
              reject(tooLarge(opts.maxBytes));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => resolve({ status, location, contentType, body: new Uint8Array(Buffer.concat(chunks)) }));
          res.on('error', (e) => reject(new ExternalServiceError(`Download failed: ${e.message}`)));
        },
      );
      req.on('timeout', () => req.destroy(new ExternalServiceError('The server took too long to respond')));
      req.on('error', (e) =>
        reject(e instanceof ValidationError || e instanceof ExternalServiceError ? e : new ExternalServiceError(`Could not fetch the URL: ${e.message}`)),
      );
    });
  }
}

function tooLarge(maxBytes: number): ValidationError {
  return new ValidationError(`The file exceeds the ${Math.round(maxBytes / 1024)}KB import cap`);
}
