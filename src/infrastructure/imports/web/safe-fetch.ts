import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { Writable, type Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { LookupFunction } from 'node:net';
import { fail, ok, type Result } from '@core/result/result';
import { UnprocessableFailure, type Failure } from '@core/failure';
import { ImportUrl } from '@domain/imports/import-url';
import { isPublicAddress } from '@infrastructure/imports/web/public-address';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

interface SafeFetchOptions {
  readonly maxBytes: number;
  readonly accept: string;
  readonly signal?: AbortSignal | undefined;
}

interface SafeFetchResponse {
  readonly body: Buffer;
  readonly contentType: string;
  /** Where the redirects ended, which is the address the content belongs to. */
  readonly finalUrl: string;
}

interface ResolvedAddress {
  readonly address: string;
  readonly family: number;
}

/** The seams a test replaces: name resolution, and the two judgements. */
interface SafeFetchDeps {
  readonly resolve: (hostname: string) => Promise<ResolvedAddress[]>;
  readonly isAllowedAddress: (address: string) => boolean;
  readonly isAllowedUrl: (url: string) => boolean;
}

/** One request's answer: the content, or where it says to go instead. */
type Hop = { readonly response: SafeFetchResponse } | { readonly redirectTo: string };

const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;
const HTTP_REDIRECT_MIN = 300;
const HTTP_REDIRECT_MAX = 399;
const USER_AGENT = 'Mozilla/5.0 (compatible; RecipelyBot/1.0; +https://recipely.net/about)';
const UNREACHABLE = 'errors.import.page_unreachable';

/**
 * User-directed fetches never share a keep-alive pool with the worker's own
 * API traffic: a socket opened to one address must not be reused for another.
 */
const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

const decoderFor = (res: http.IncomingMessage): Transform | null => {
  const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
  if (encoding === 'gzip' || encoding === 'x-gzip') return zlib.createGunzip();
  if (encoding === 'deflate') return zlib.createInflate();
  if (encoding === 'br') return zlib.createBrotliDecompress();
  return null;
};

/**
 * The body, decompressed and capped. `pipeline` is what makes a truncated or
 * reset response reject: a bare `pipe` drops the source's errors, and a gzip
 * stream whose source died mid-body simply never ends.
 */
const readBody = async (res: http.IncomingMessage, maxBytes: number, signal: AbortSignal): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let size = 0;
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      if (size > maxBytes) return done(new Error('body over the byte cap'));
      chunks.push(chunk);
      return done();
    },
  });
  const decoder = decoderFor(res);
  if (decoder === null) await pipeline(res, sink, { signal });
  else await pipeline(res, decoder, sink, { signal });
  return Buffer.concat(chunks);
};

/**
 * GETs a web page or image on a user's behalf without letting the user aim it
 * at the box's own network.
 *
 * @remarks
 * - **Four guards, each for a different trick.** The URL must pass
 *   `ImportUrl` (scheme, port, no IP literal); every address its name resolves
 *   to must be public, checked by the socket's own lookup so no DNS answer can
 *   change between the check and the connection; each redirect is re-checked
 *   from the top, since a public page may redirect to `http://169.254.169.254/`;
 *   and the body is capped AFTER decompression, so a small gzip cannot inflate
 *   into gigabytes.
 * - **Nothing outlives the timeout.** One signal covers the whole chain —
 *   connect, every redirect, every byte of every body.
 * - **An honest user agent.** Some sites refuse bots; pretending to be a
 *   browser to get past that is not a trade this app makes.
 */
export const createSafeFetch =
  (deps: SafeFetchDeps) =>
  async (rawUrl: string, options: SafeFetchOptions): Promise<Result<SafeFetchResponse, Failure>> => {
    const signal = options.signal !== undefined
      ? AbortSignal.any([options.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      : AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    const lookup: LookupFunction = (hostname, lookupOptions, callback) => {
      deps.resolve(hostname).then(
        (addresses) => {
          if (addresses.length === 0 || !addresses.every((a) => deps.isAllowedAddress(a.address))) {
            return callback(new Error(`refused non-public address for ${hostname}`), '', 0);
          }
          if (lookupOptions.all === true) return callback(null, addresses);
          const first = addresses[0]!;
          return callback(null, first.address, first.family);
        },
        (err: NodeJS.ErrnoException) => callback(err, '', 0),
      );
    };

    const requestOnce = (url: string): Promise<Hop> =>
      new Promise((resolve, reject) => {
        const isHttps = url.startsWith('https:');
        const req = (isHttps ? https : http).get(
          url,
          {
            agent: isHttps ? httpsAgent : httpAgent,
            lookup,
            signal,
            headers: { 'user-agent': USER_AGENT, accept: options.accept, 'accept-encoding': 'gzip, deflate, br' },
          },
          (res) => {
            const status = res.statusCode ?? 0;
            if (status >= HTTP_REDIRECT_MIN && status <= HTTP_REDIRECT_MAX && res.headers.location !== undefined) {
              res.resume();
              resolve({ redirectTo: new URL(res.headers.location, url).toString() });
              return;
            }
            if (status < HTTP_OK_MIN || status > HTTP_OK_MAX) {
              res.resume();
              reject(new Error(`status ${String(status)}`));
              return;
            }
            readBody(res, options.maxBytes, signal).then(
              (body) => resolve({ response: { body, contentType: String(res.headers['content-type'] ?? ''), finalUrl: url } }),
              reject,
            );
          },
        );
        req.on('error', reject);
      });

    let current = rawUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!deps.isAllowedUrl(current)) {
        logger.warn({ url: current }, 'web_import_url_refused');
        return fail(new UnprocessableFailure(UNREACHABLE));
      }
      try {
        const result = await requestOnce(current);
        if ('response' in result) return ok(result.response);
        current = result.redirectTo;
      } catch (err) {
        logger.warn({ host: safeHost(current), reason: err instanceof Error ? err.message : String(err) }, 'web_import_fetch_failed');
        return fail(new UnprocessableFailure(UNREACHABLE));
      }
    }
    logger.warn({ host: safeHost(current) }, 'web_import_too_many_redirects');
    return fail(new UnprocessableFailure(UNREACHABLE));
  };

const safeHost = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

/** The production fetcher: the system resolver, public addresses only, `ImportUrl`'s rules. */
export const safeFetch = createSafeFetch({
  resolve: (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true }),
  isAllowedAddress: isPublicAddress,
  isAllowedUrl: (url) => ImportUrl.create(url).ok,
});
