/**
 * Bridges the Web `Request`/`Response` objects that Next.js route handlers
 * speak to the Node `IncomingMessage`/`ServerResponse` objects that Express —
 * and therefore Nest — speaks.
 *
 * Nest was written to sit on a real Node HTTP server. On Vercel it no longer
 * does, so we synthesise the two halves of a Node request cycle: a readable
 * `IncomingMessage` fed from the Web request body, and a `ServerResponse`
 * whose writes are captured into a buffer instead of a socket.
 */
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

/** A `ServerResponse` whose output is collected rather than written to a socket. */
interface CapturedResponse {
  res: ServerResponse;
  /** Resolves once the handler calls `res.end()`. */
  finished: Promise<void>;
  getBody: () => Buffer;
  /** Headers passed positionally to `writeHead`, which bypass `setHeader`. */
  getWriteHeadHeaders: () => Record<string, number | string | string[]>;
}

/** Status codes that must not carry a response body. */
const BODILESS_STATUSES = new Set([204, 205, 304]);

export async function toNodeRequest(request: Request): Promise<IncomingMessage> {
  const socket = new Socket();
  const req = new IncomingMessage(socket);

  const url = new URL(request.url);
  req.method = request.method;
  // Express routes on the path + query only; the origin is never part of it.
  req.url = url.pathname + url.search;
  req.httpVersion = '1.1';
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  req.headers = headers;
  req.rawHeaders = Object.entries(headers).flat();

  // Buffer the body up front. Streaming it would be nicer, but body-parser and
  // multer both consume the stream synchronously during Express's middleware
  // phase, and a partially-arrived body deadlocks them.
  if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
    const buffer = Buffer.from(await request.arrayBuffer());
    req.push(buffer);
  }
  req.push(null);

  return req;
}

export function createCapturedResponse(req: IncomingMessage): CapturedResponse {
  const res = new ServerResponse(req);
  const chunks: Buffer[] = [];
  const writeHeadHeaders: Record<string, number | string | string[]> = {};

  let resolveFinished: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  const collect = (chunk: unknown, encoding?: unknown): void => {
    if (chunk == null) return;
    if (typeof chunk === 'string') {
      chunks.push(
        Buffer.from(chunk, typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8'),
      );
    } else {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
  };

  // `writeHead(status, headers)` sets headers through an internal path that
  // `getHeaders()` does not always reflect, so capture them separately.
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function patchedWriteHead(
    this: ServerResponse,
    statusCode: number,
    ...rest: unknown[]
  ) {
    const maybeHeaders = rest.find((arg) => typeof arg === 'object' && arg !== null);
    if (maybeHeaders && !Array.isArray(maybeHeaders)) {
      Object.assign(writeHeadHeaders, maybeHeaders);
    }
    return originalWriteHead(statusCode, ...(rest as never[]));
  } as ServerResponse['writeHead'];

  res.write = function patchedWrite(chunk: unknown, encoding?: unknown, callback?: unknown) {
    collect(chunk, encoding);
    const cb = typeof encoding === 'function' ? encoding : callback;
    if (typeof cb === 'function') cb();
    return true;
  } as ServerResponse['write'];

  res.end = function patchedEnd(this: ServerResponse, chunk?: unknown, encoding?: unknown, callback?: unknown) {
    // end() is overloaded: end(cb), end(chunk, cb), end(chunk, encoding, cb).
    if (typeof chunk !== 'function') collect(chunk, encoding);
    const cb = [chunk, encoding, callback].find((arg) => typeof arg === 'function');
    if (typeof cb === 'function') (cb as () => void)();
    resolveFinished();
    return this;
  } as ServerResponse['end'];

  return {
    res,
    finished,
    getBody: () => Buffer.concat(chunks),
    getWriteHeadHeaders: () => writeHeadHeaders,
  };
}

/**
 * Copies a Node Buffer into a plain `Uint8Array`.
 *
 * `Response` accepts an ArrayBuffer-backed view, but a Node Buffer is backed
 * by `ArrayBufferLike` (possibly shared), which the Web types reject. A view
 * would avoid the copy but cannot express the narrower backing type.
 */
function toBodyInit(buffer: Buffer): Uint8Array<ArrayBuffer> {
  // Allocating the ArrayBuffer explicitly is what pins the generic parameter:
  // `new Uint8Array(length)` widens to ArrayBufferLike, which BufferSource
  // (and therefore BodyInit) rejects.
  const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  bytes.set(buffer);
  return bytes;
}

export function toWebResponse(captured: CapturedResponse): Response {
  const { res, getBody, getWriteHeadHeaders } = captured;
  const headers = new Headers();

  const append = (key: string, value: number | string | string[] | undefined): void => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      // Set-Cookie is the reason this branch exists — auth issues multiple
      // cookies per response and collapsing them would break refresh.
      for (const entry of value) headers.append(key, entry);
    } else {
      headers.set(key, String(value));
    }
  };

  for (const [key, value] of Object.entries(res.getHeaders())) append(key, value);
  for (const [key, value] of Object.entries(getWriteHeadHeaders())) append(key, value);

  const status = res.statusCode || 200;
  const isBodiless = BODILESS_STATUSES.has(status) || res.req?.method === 'HEAD';
  const body = isBodiless ? null : toBodyInit(getBody());

  // Content-Length is recomputed by the platform; a stale one truncates.
  headers.delete('content-length');

  return new Response(body, { status, statusText: res.statusMessage, headers });
}
