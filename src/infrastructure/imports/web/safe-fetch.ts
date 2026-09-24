import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import type { LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import { fail, ok, type Result } from '@core/result/result';
import { UnprocessableFailure, type Failure } from '@core/failure';
import { ImportUrl } from '@domain/imports/import-url';
import { isPublicAddress } from '@infrastructure/imports/web/public-address';

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

const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;
const HTTP_REDIRECT_MIN = 300;
const HTTP_REDIRECT_MAX = 399;
const USER_AGENT = 'Mozilla/5.0 (compatible; RecipelyBot/1.0; +https://recipely.net/about)';
const UNREACHABLE = 'errors.import.page_unreachable';

/**
 * Resolves a host and refuses it unless EVERY address it names is public.
 *
 * Checked here, inside the connection, rather than before it: a name checked
 * once and connected to later can answer differently the second time (DNS
 * rebinding). The address this approves is the one the socket uses.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
      return callback(new Error(`refused non-public address for ${hostname}`), '', 0);
    }
    if (options.all === true) return callback(null, addresses);
    const first = addresses[0]!;
    return callback(null, first.address, first.family);
  });
};

const decoded = (res: http.IncomingMessage): Readable => {
  const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
  if (encoding === 'gzip' || encoding === 'x-gzip') return res.pipe(zlib.createGunzip());
  if (encoding === 'deflate') return res.pipe(zlib.createInflate());
  if (encoding === 'br') return res.pipe(zlib.createBrotliDecompress());
  return res;
};

/** One request's answer: the content, or where it says to go instead. */
type Hop = { readonly response: SafeFetchResponse } | { readonly redirectTo: string };

/**
 * GETs a web page or image on a user's behalf without letting the user aim it
 * at the box's own network.
 *
 * @remarks
 * - **Four guards, each for a different trick.** The URL must pass
 *   `ImportUrl` (scheme, port, no IP literal); every address its name resolves
 *   to must be public, checked by the socket's own lookup; each redirect is
 *   re-checked from the top, since a public page may redirect to
 *   `http://169.254.169.254/`; and the body is capped AFTER decompression, so a
 *   small gzip cannot inflate into gigabytes.
 * - **An honest user agent.** Some sites refuse bots; pretending to be a
 *   browser to get past that is not a trade this app makes.
 */
export const safeFetch = async (
  rawUrl: string,
  options: SafeFetchOptions,
): Promise<Result<SafeFetchResponse, Failure>> => {
  const signal = options.signal !== undefined
    ? AbortSignal.any([options.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    : AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = ImportUrl.create(current);
    if (!url.ok) return fail(new UnprocessableFailure(UNREACHABLE));

    let result: Hop;
    try {
      result = await requestOnce(url.value.toString(), options, signal);
    } catch {
      return fail(new UnprocessableFailure(UNREACHABLE));
    }
    if ('response' in result) return ok(result.response);
    current = result.redirectTo;
  }
  return fail(new UnprocessableFailure(UNREACHABLE));
};

const requestOnce = (url: string, options: SafeFetchOptions, signal: AbortSignal): Promise<Hop> =>
  new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(
      url,
      {
        lookup: guardedLookup,
        signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: options.accept,
          'accept-encoding': 'gzip, deflate, br',
        },
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

        const chunks: Buffer[] = [];
        let size = 0;
        const body = decoded(res);
        body.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            req.destroy();
            body.destroy();
            reject(new Error('body over the byte cap'));
            return;
          }
          chunks.push(chunk);
        });
        body.on('error', reject);
        body.on('end', () =>
          resolve({
            response: {
              body: Buffer.concat(chunks),
              contentType: String(res.headers['content-type'] ?? ''),
              finalUrl: url,
            },
          }),
        );
      },
    );
    req.on('error', reject);
  });
