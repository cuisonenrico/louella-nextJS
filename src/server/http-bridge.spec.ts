import { createCapturedResponse, toNodeRequest, toWebResponse } from './http-bridge';

/**
 * These cover the seams between Node's HTTP objects and the Web ones, which is
 * where this bridge can silently corrupt a response — a dropped Set-Cookie
 * logs every user out, a stale Content-Length truncates a payload.
 */
describe('http-bridge', () => {
  describe('toNodeRequest', () => {
    it('preserves path and query but drops the origin, as Express expects', async () => {
      const req = await toNodeRequest(
        new Request('https://example.com/api/v1/inventory?date=2026-08-02&branchId=3'),
      );

      expect(req.url).toBe('/api/v1/inventory?date=2026-08-02&branchId=3');
      expect(req.method).toBe('GET');
    });

    it('lower-cases header names so Express lookups hit', async () => {
      const req = await toNodeRequest(
        new Request('https://example.com/api/v1/me', {
          headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        }),
      );

      expect(req.headers.authorization).toBe('Bearer token');
      expect(req.headers['content-type']).toBe('application/json');
    });

    it('replays the request body so body-parser can read it', async () => {
      const req = await toNodeRequest(
        new Request('https://example.com/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'a@b.com' }),
        }),
      );

      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array));

      expect(Buffer.concat(chunks).toString()).toBe('{"email":"a@b.com"}');
    });

    it('ends the stream for GET so middleware does not wait on a body', async () => {
      const req = await toNodeRequest(new Request('https://example.com/api/v1/products'));

      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array));

      expect(Buffer.concat(chunks)).toHaveLength(0);
    });
  });

  describe('toWebResponse', () => {
    it('carries status and body through', async () => {
      const req = await toNodeRequest(new Request('https://example.com/api/v1/products'));
      const captured = createCapturedResponse(req);

      captured.res.statusCode = 201;
      captured.res.setHeader('Content-Type', 'application/json');
      captured.res.end(JSON.stringify({ id: 7 }));
      await captured.finished;

      const response = toWebResponse(captured);
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ id: 7 });
    });

    it('keeps every Set-Cookie separate rather than collapsing them', async () => {
      const req = await toNodeRequest(new Request('https://example.com/api/v1/auth/login'));
      const captured = createCapturedResponse(req);

      // Auth issues both tokens on one response; collapsing them into a single
      // comma-joined header would break the refresh flow.
      captured.res.setHeader('Set-Cookie', [
        'accessToken=a; HttpOnly; Path=/',
        'refreshToken=r; HttpOnly; Path=/',
      ]);
      captured.res.end();
      await captured.finished;

      const cookies = toWebResponse(captured).headers.getSetCookie();
      expect(cookies).toHaveLength(2);
      expect(cookies[0]).toContain('accessToken=a');
      expect(cookies[1]).toContain('refreshToken=r');
    });

    it('captures headers passed positionally to writeHead', async () => {
      const req = await toNodeRequest(new Request('https://example.com/api/v1/files'));
      const captured = createCapturedResponse(req);

      // writeHead bypasses setHeader, so these would vanish without the patch.
      captured.res.writeHead(302, { Location: '/api/v1/files/1' });
      captured.res.end();
      await captured.finished;

      const response = toWebResponse(captured);
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/api/v1/files/1');
    });

    it('assembles a body written in multiple chunks', async () => {
      const req = await toNodeRequest(new Request('https://example.com/api/v1/sales'));
      const captured = createCapturedResponse(req);

      captured.res.write('{"total":');
      captured.res.write('42}');
      captured.res.end();
      await captured.finished;

      expect(await toWebResponse(captured).text()).toBe('{"total":42}');
    });

    it('sends no body for a 204', async () => {
      const req = await toNodeRequest(new Request('https://example.com/api/v1/inventory/1'));
      const captured = createCapturedResponse(req);

      captured.res.statusCode = 204;
      captured.res.end();
      await captured.finished;

      expect(toWebResponse(captured).body).toBeNull();
    });

    it('drops Content-Length so the platform recomputes it', async () => {
      const req = await toNodeRequest(new Request('https://example.com/api/v1/products'));
      const captured = createCapturedResponse(req);

      captured.res.setHeader('Content-Length', '999');
      captured.res.end('short');
      await captured.finished;

      expect(toWebResponse(captured).headers.get('content-length')).toBeNull();
    });

    it('preserves binary payloads byte for byte', async () => {
      const req = await toNodeRequest(new Request('https://example.com/api/v1/export'));
      const captured = createCapturedResponse(req);

      // Inventory export ships XLSX; a utf8 round-trip would corrupt it.
      const payload = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0xfe]);
      captured.res.end(payload);
      await captured.finished;

      const bytes = new Uint8Array(await toWebResponse(captured).arrayBuffer());
      expect(Array.from(bytes)).toEqual(Array.from(payload));
    });

    it('invokes the end callback so Express can finalise', async () => {
      const req = await toNodeRequest(new Request('https://example.com/api/v1/products'));
      const captured = createCapturedResponse(req);
      const onEnd = jest.fn();

      captured.res.end(onEnd);
      await captured.finished;

      expect(onEnd).toHaveBeenCalled();
    });
  });
});
