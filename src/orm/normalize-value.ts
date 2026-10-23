import { Timestamp } from '@google-cloud/firestore';
import { toDate } from './date';

export interface ValueNormalizer {
  matches(value: unknown): boolean;
  normalize(value: unknown): unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Add future conversions here, in precedence order. The first match wins.
const normalizers: readonly ValueNormalizer[] = [
  {
    matches(value) {
      if (value instanceof Timestamp) return true;
      if (!isPlainObject(value) || Reflect.ownKeys(value).length !== 2)
        return false;
      return (
        (Object.prototype.hasOwnProperty.call(value, 'seconds') &&
          Object.prototype.hasOwnProperty.call(value, 'nanoseconds')) ||
        (Object.prototype.hasOwnProperty.call(value, '_seconds') &&
          Object.prototype.hasOwnProperty.call(value, '_nanoseconds'))
      );
    },
    normalize: (value) => toDate(value) ?? value,
  },
];

/** Normalize ORM values without mutating inputs or traversing SDK instances. */
export function normalizeValue(value: unknown): unknown {
  for (const normalizer of normalizers) {
    if (normalizer.matches(value)) return normalizer.normalize(value);
  }
  if (Array.isArray(value)) {
    const normalized = value.map(normalizeValue);
    return normalized.some((item, index) => !Object.is(item, value[index]))
      ? normalized
      : value;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    const normalized = entries.map(
      ([key, item]) => [key, normalizeValue(item)] as const,
    );
    if (
      normalized.every(([, item], index) => Object.is(item, entries[index][1]))
    )
      return value;
    const result = Object.create(Object.getPrototypeOf(value));
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, item] of normalized) {
      if (!Object.is(item, value[key])) {
        descriptors[key] = {
          value: item,
          enumerable: true,
          configurable: true,
          writable: true,
        };
      }
    }
    Object.defineProperties(result, descriptors);
    return result;
  }
  return value;
}
