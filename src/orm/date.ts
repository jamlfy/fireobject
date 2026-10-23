/**
 * Converts a date-like value into a valid JavaScript `Date`.
 *
 * Accepts `Date` instances, strings, millisecond timestamps, Firestore
 * `Timestamp` objects, and plain `{ seconds, nanoseconds }` objects (including
 * the `_seconds`/`_nanoseconds` shape used by some serializers).
 *
 * @param value - Date-like value to convert.
 * @returns A valid `Date`, or `undefined` when the value cannot be converted.
 */
export function toDate(value: unknown): Date | undefined {
  try {
    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'string' || typeof value === 'number') {
      date = new Date(value);
    } else if (value && typeof value === 'object') {
      const timestamp = value as {
        toDate?: () => Date;
        toMillis?: () => number;
        seconds?: number;
        nanoseconds?: number;
        _seconds?: number;
        _nanoseconds?: number;
      };
      if (typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (typeof timestamp.toMillis === 'function') {
        date = new Date(timestamp.toMillis());
      } else {
        const seconds = timestamp.seconds ?? timestamp._seconds;
        const nanoseconds =
          timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0;
        if (
          typeof seconds !== 'number' ||
          !Number.isInteger(seconds) ||
          !Number.isInteger(nanoseconds) ||
          nanoseconds < 0 ||
          nanoseconds >= 1_000_000_000
        )
          return undefined;
        date = new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000));
      }
    } else {
      return undefined;
    }
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date
      : undefined;
  } catch {
    return undefined;
  }
}
