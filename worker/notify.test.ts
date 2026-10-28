import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANONICAL_ORIGIN, CUSTOM_ORIGIN } from '../src/lib/access';
import { DEFAULT_APPROVAL_FROM, notifyApproved, sendApprovalMail } from './notify';

const KEY = 'test-resend-key';
const TO = 'ana@example.com';

type Call = { url: string; init?: RequestInit };

function mockFetch(status = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response('{"id":"email_test"}', { status });
    }),
  );
  return calls;
}

function logged(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
}

describe('approval mail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs the Resend request shape', async () => {
    const calls = mockFetch();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await notifyApproved({ RESEND_API_KEY: KEY }, TO);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    expect(calls[0]?.init?.method).toBe('POST');
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${KEY}`);
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      from: DEFAULT_APPROVAL_FROM,
      to: [TO],
      subject: 'Uso sin límite',
      text: `Ya tenés búsquedas sin límite.\n${CANONICAL_ORIGIN}\n${CUSTOM_ORIGIN}\n`,
      html: `<p>Ya tenés búsquedas sin límite.</p><p><a href="${CANONICAL_ORIGIN}">DJTube</a></p><p><a href="${CUSTOM_ORIGIN}">${CUSTOM_ORIGIN}</a></p>`,
    });
    expect(DEFAULT_APPROVAL_FROM).toBe('DJTube <no-responder@lulox.com.ar>');
    expect(error).not.toHaveBeenCalled();
  });

  it('uses APPROVAL_FROM when it is set', async () => {
    const calls = mockFetch();
    await sendApprovalMail({ RESEND_API_KEY: KEY, APPROVAL_FROM: 'DJTube <otro@lulox.com.ar>' }, TO);
    expect(JSON.parse(String(calls[0]?.init?.body)).from).toBe('DJTube <otro@lulox.com.ar>');
  });

  it('falls back when APPROVAL_FROM is blank', async () => {
    const calls = mockFetch();
    await sendApprovalMail({ RESEND_API_KEY: KEY, APPROVAL_FROM: '  \n' }, TO);
    expect(JSON.parse(String(calls[0]?.init?.body)).from).toBe(DEFAULT_APPROVAL_FROM);
  });

  it('still resolves when Resend rejects, and the log has no secret', async () => {
    const calls = mockFetch(422);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(notifyApproved({ RESEND_API_KEY: KEY }, TO)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    const text = logged(error);
    expect(text).toContain('422');
    expect(text).not.toContain(KEY);
    expect(text).not.toContain('Bearer');
  });

  it('still resolves when fetch throws, and the log has no secret', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(`network ${KEY}`);
      }),
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(sendApprovalMail({ RESEND_API_KEY: KEY }, TO)).resolves.toBeUndefined();
    const text = logged(error);
    expect(text).toBe('[approval] send failed');
    expect(text).not.toContain(KEY);
  });

  it('does not call Resend when the key is missing', async () => {
    const calls = mockFetch();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(notifyApproved({ RESEND_API_KEY: '   ' }, TO)).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
    expect(logged(error)).toBe('[approval] mail not configured');
  });
});
