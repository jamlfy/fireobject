import { Timestamp } from '@google-cloud/firestore';
import { toDate } from './date';

/** Strategy that detects and normalizes a specific kind of value. */
export interface ValueNormalizer {
  /** Returns `true` when this normalizer handles the value. */
  matches(value: unknown): boolean;
  /** Returns the normalized representation of the value. */
  normalize(value: unknown): unknown;
}

/**
 * Checks whether a value is a plain object (not a class instance or SDK
 * object).
 *
 * @param value - Value to inspect.
 * @returns `true` for objects with `Object.prototype` or `null` prototypes.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Add future conversions here, in precedence order. The first match wins.
/** Built-in value normalizers, evaluated in order. */
const normalizers: readonly ValueNormalizer[] = [
  {
    /**
     * Detects Firestore timestamps and plain timestamp-shaped objects.
     *
     * @param value - Value to inspect.
     * @returns `true` when the value looks like a timestamp.
     */
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
    /** Converts a timestamp to a `Date`, keeping the value if invalid. */
    normalize: (value) => toDate(value) ?? value,
  },
];

/**
 * Normalizes ORM values without mutating inputs or traversing SDK instances.
 *
 * Timestamp-like values become `Date` instances. Arrays and plain objects are
 * traversed recursively, preserving identity when nothing changes. SDK
 * instances, class instances, buffers, maps, and primitives are returned
 * untouched.
 *
 * @param value - Value to normalize.
 * @returns The normalized value (possibly the original reference).
 */
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
