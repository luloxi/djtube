import { describe, expect, it } from 'vitest';
import { adminAlert, parseAdminSeen } from './access';

const people = [
  { email: 'a@x.com', firstSeen: '2026-10-01T10:00:00Z' },
  { email: 'b@x.com', firstSeen: '2026-10-05T10:00:00Z' },
  { email: 'lucianoolivabianco@gmail.com', firstSeen: '2026-10-20T10:00:00Z', owner: true },
];

describe('admin alert', () => {
  it('stays quiet the first time and just records where things stand', () => {
    const result = adminAlert(people, 1, null);
    expect(result.alert).toBe(false);
    expect(result.mark).toEqual({ at: '2026-10-05T10:00:00Z', pending: 1 });
  });

  it('lights up when someone joined after the last visit, and ignores the owner', () => {
    const seen = { at: '2026-10-01T10:00:00Z', pending: 0 };
    expect(adminAlert(people, 0, seen).alert).toBe(true);
    expect(adminAlert(people, 0, { at: '2026-10-05T10:00:00Z', pending: 0 }).alert).toBe(false);
  });

  it('lights up when more people are waiting than before', () => {
    const seen = { at: '2026-10-05T10:00:00Z', pending: 1 };
    expect(adminAlert(people, 2, seen).alert).toBe(true);
    expect(adminAlert(people, 1, seen).alert).toBe(false);
  });

  it('reads the stored marker defensively', () => {
    expect(parseAdminSeen(null)).toBeNull();
    expect(parseAdminSeen('nope')).toBeNull();
    expect(parseAdminSeen('{"at":1}')).toBeNull();
    expect(parseAdminSeen('{"at":"x","pending":2}')).toEqual({ at: 'x', pending: 2 });
  });
});
