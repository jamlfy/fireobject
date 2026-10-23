import { Firestore, Timestamp } from '@google-cloud/firestore';
import { normalizeValue } from '../../src/orm/normalize-value';

describe('normalizeValue', () => {
  const date = new Date(1790450080361);
  const timestamp = { _seconds: 1790450080, _nanoseconds: 361000000 };

  it.each([
    new Timestamp(1790450080, 361000000),
    timestamp,
    { seconds: 1790450080, nanoseconds: 361000000 },
  ])('normalizes recognized timestamps %p', (value) => {
    expect(normalizeValue(value)).toEqual(date);
  });

  it('copies only changed containers and never mutates frozen inputs', () => {
    const unchanged = Object.freeze({ label: 'keep me' });
    const input = Object.freeze({
      unchanged,
      ingestion: Object.freeze({ verifiedAt: Object.freeze(timestamp) }),
      history: Object.freeze([timestamp]),
    });
    const result = normalizeValue(input) as typeof input;
    expect(result).toEqual({
      unchanged,
      ingestion: { verifiedAt: date },
      history: [date],
    });
    expect(result).not.toBe(input);
    expect(result.unchanged).toBe(unchanged);
    expect(input.ingestion.verifiedAt).toBe(timestamp);
    expect(input.history[0]).toBe(timestamp);
    expect(normalizeValue(result)).toBe(result);
  });

  it.each([
    null,
    undefined,
    1790450080361,
    '2026-01-01',
    date,
    Buffer.from('data'),
    new Map(),
    { seconds: 1, nanoseconds: 0, label: 'ordinary object' },
    { seconds: 1 },
    { seconds: 1, nanoseconds: -1 },
    { _seconds: 'invalid', _nanoseconds: 0 },
    { toDate: () => date },
  ])('preserves unrecognized or invalid values %p', (value) => {
    expect(normalizeValue(value)).toBe(value);
  });

  it('preserves document references and custom instances', () => {
    const ref = new Firestore({ projectId: 'demo-tests' }).doc('Tests/example');
    class Custom {
      value = timestamp;
    }
    const custom = new Custom();
    expect(normalizeValue(ref)).toBe(ref);
    expect(normalizeValue(custom)).toBe(custom);
    expect(custom.value).toBe(timestamp);
  });

  it('preserves null prototypes and unchanged array identity', () => {
    const input = Object.assign(Object.create(null), { createdAt: timestamp });
    const result = normalizeValue(input);
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(result).toEqual({ createdAt: date });
    const array = ['keep', 42, NaN];
    expect(normalizeValue(array)).toBe(array);
  });
});
