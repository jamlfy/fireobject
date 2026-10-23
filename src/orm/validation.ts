/**
 * Requires a value to be present.
 *
 * `undefined`, `null`, and empty strings are rejected; `0` and `false` are
 * accepted.
 *
 * @param value - Value to validate.
 * @returns `true` when valid, otherwise an error message.
 */
export const isRequired = (value: unknown): boolean | string =>
  (value !== undefined && value !== null && value !== '') ||
  'This field is required';

/**
 * Requires a string value.
 *
 * @param value - Value to validate.
 * @returns `true` when valid, otherwise an error message.
 */
export const isString = (value: unknown): boolean | string =>
  typeof value === 'string' || 'Should be a string';

/**
 * Requires a finite number.
 *
 * `NaN`, `Infinity`, and `-Infinity` are rejected.
 *
 * @param value - Value to validate.
 * @returns `true` when valid, otherwise an error message.
 */
export const isNumber = (value: unknown): boolean | string =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  'Should be a number';

/**
 * Requires a finite integer.
 *
 * @param value - Value to validate.
 * @returns `true` when valid, otherwise an error message.
 */
export const isInteger = (value: unknown): boolean | string =>
  Number.isInteger(value) || 'Should be an integer';

/**
 * Requires a boolean value.
 *
 * @param value - Value to validate.
 * @returns `true` when valid, otherwise an error message.
 */
export const isBoolean = (value: unknown): boolean | string =>
  typeof value === 'boolean' || 'Should be a boolean';

/**
 * Requires an array.
 *
 * @param value - Value to validate.
 * @returns `true` when valid, otherwise an error message.
 */
export const isArray = (value: unknown): boolean | string =>
  Array.isArray(value) || 'Should be an array';

/**
 * Performs a minimal email-format check.
 *
 * This validator only verifies that the value is a string containing `@`.
 *
 * @param value - Value to validate.
 * @returns `true` when valid, otherwise an error message.
 */
export const isEmail = (value: unknown): boolean | string =>
  (typeof value === 'string' && value.includes('@')) ||
  'The format is not valid';

/**
 * Requires an absolute HTTP(S) URL.
 *
 * @param value - Value to validate.
 * @returns `true` when valid, otherwise an error message.
 */
export const isUrl = (value: unknown): boolean | string => {
  if (typeof value !== 'string' || value.trim() === '')
    return 'Should be a valid URL';
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') ||
      'Should be a valid URL'
    );
  } catch {
    return 'Should be a valid URL';
  }
};

/**
 * Requires an RFC 4122 UUID (versions 1-8).
 *
 * @param value - Value to validate.
 * @returns `true` when valid, otherwise an error message.
 */
export const isUuid = (value: unknown): boolean | string =>
  (typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )) ||
  'Should be a UUID';

/**
 * Creates a validator that enforces a minimum length.
 *
 * @param minimum - Minimum number of characters/items.
 * @returns A validator for strings and arrays.
 */
export const minLength =
  (minimum: number) =>
  /**
   * @param value - String or array to validate.
   * @returns `true` when the length is sufficient, otherwise an error message.
   */
  (value: unknown): boolean | string =>
    ((typeof value === 'string' || Array.isArray(value)) &&
      value.length >= minimum) ||
    `Should contain at least ${minimum} characters`;

/**
 * Creates a validator that enforces a maximum length.
 *
 * @param max - Maximum number of characters/items.
 * @returns A validator for strings and arrays.
 */
export const maxLength =
  (max: number) =>
  /**
   * @param value - String or array to validate.
   * @returns `true` when the length is sufficient, otherwise an error message.
   */
  (value: unknown): boolean | string =>
    ((typeof value === 'string' || Array.isArray(value)) &&
      value.length <= max) ||
    `Should contain at most ${max} characters`;

/**
 * Creates a validator that enforces a minimum numeric value.
 *
 * @param minimum - Smallest accepted value.
 * @param message - Optional custom error message.
 * @returns A validator for finite numbers.
 */
export const minValue =
  (
    minimum: number,
    message = `Should be greater than or equal to ${minimum}`,
  ) =>
  /**
   * @param value - Value to validate.
   * @returns `true` when valid, otherwise the error message.
   */
  (value: unknown): boolean | string =>
    (typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= minimum) ||
    message;

/**
 * Creates a validator that enforces a maximum numeric value.
 *
 * @param maximum - Largest accepted value.
 * @param message - Optional custom error message.
 * @returns A validator for finite numbers.
 */
export const maxValue =
  (
    maximum: number,
    message = `Should be less than or equal to ${maximum}`,
  ) =>
  /**
   * @param value - Value to validate.
   * @returns `true` when valid, otherwise the error message.
   */
  (value: unknown): boolean | string =>
    (typeof value === 'number' &&
      Number.isFinite(value) &&
      value <= maximum) ||
    message;

/**
 * Creates a validator that only accepts listed values.
 *
 * Values are compared with `Object.is`, so `NaN` can be included explicitly.
 *
 * @param allowed - Values accepted by the validator.
 * @param message - Optional custom error message.
 * @returns A validator for any value.
 */
export const oneOf =
  (
    allowed: readonly unknown[],
    message = 'Should be one of the allowed values',
  ) =>
  /**
   * @param value - Value to validate.
   * @returns `true` when valid, otherwise the error message.
   */
  (value: unknown): boolean | string =>
    allowed.some((item) => Object.is(item, value)) || message;

/**
 * Creates a validator that ensures another field in the model has a value.
 *
 * @param reference - Name of the field that must exist.
 * @returns A validator usable with `@field`.
 */
export const cleanRef =
  (reference: string) =>
  /**
   * @param _value - Value of the field being validated (unused).
   * @param values - Current model values.
   * @returns `true` when the referenced field exists, otherwise an error.
   */
  (_value: unknown, values?: Map<string, unknown>): boolean | string =>
    Boolean(values?.get(reference)) || `Field ${reference} does not exist`;

/**
 * Creates a validator that requires a non-empty string.
 *
 * @param message - Optional custom error message.
 * @returns A validator for strings.
 */
export const nonEmptyString =
  (message = 'Should be a non-empty string') =>
  /**
   * @param value - Value to validate.
   * @returns `true` when valid, otherwise the error message.
   */
  (value: unknown): boolean | string =>
    (typeof value === 'string' && value.trim().length > 0) || message;

/**
 * Creates a validator that requires a non-empty array.
 *
 * @param message - Optional custom error message.
 * @returns A validator for arrays.
 */
export const nonEmptyArray =
  (message = 'Should be a non-empty array') =>
  /**
   * @param value - Value to validate.
   * @returns `true` when valid, otherwise the error message.
   */
  (value: unknown): boolean | string =>
    (Array.isArray(value) && minLength(1)(value) === true) || message;

/**
 * Creates a validator that tests a string against a regular expression.
 *
 * A new `RegExp` is created on each call so global/sticky flags do not retain
 * `lastIndex` state between validations.
 *
 * @param pattern - Regular expression to apply.
 * @param message - Optional custom error message.
 * @returns A validator for strings.
 */
export const matches =
  (pattern: RegExp, message = 'The format is not valid') =>
  /**
   * @param value - Value to validate.
   * @returns `true` when the pattern matches, otherwise the error message.
   */
  (value: unknown): boolean | string =>
    (typeof value === 'string' &&
      new RegExp(pattern.source, pattern.flags).test(value)) ||
    message;

/**
 * Converts supported date inputs into a valid `Date`.
 *
 * @param value - Date, ISO-like string, timestamp, or Firestore timestamp.
 * @returns A valid `Date`, or `null` when conversion fails.
 */
const parseDate = (value: unknown): Date | null => {
  try {
    let date: Date;
    if (value instanceof Date) date = value;
    else if (typeof value === 'string' || typeof value === 'number')
      date = new Date(value);
    else if (
      value &&
      typeof value === 'object' &&
      'toDate' in value &&
      typeof value.toDate === 'function'
    )
      date = value.toDate();
    else return null;
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
};

/**
 * Validates dates, ISO-like strings, millisecond timestamps, and Firestore
 * timestamp values.
 *
 * @param value - Value to validate.
 * @returns `true` when valid, otherwise an error message.
 */
export const isDate = (value: unknown): boolean | string =>
  parseDate(value) !== null || 'Should be a Date';

/**
 * Requires a date in the future.
 *
 * Accepts the same inputs as `isDate`.
 *
 * @param value - Value to validate.
 * @returns `true` when valid, otherwise an error message.
 */
export const isFutureDate = (value: unknown): boolean | string => {
  const date = parseDate(value);
  return (
    (date !== null && date.getTime() > Date.now()) ||
    'Should be a future date'
  );
};

/**
 * Requires a date in the past.
 *
 * Accepts the same inputs as `isDate`.
 *
 * @param value - Value to validate.
 * @returns `true` when valid, otherwise an error message.
 */
export const isPastDate = (value: unknown): boolean | string => {
  const date = parseDate(value);
  return (
    (date !== null && date.getTime() < Date.now()) || 'Should be a past date'
  );
};
