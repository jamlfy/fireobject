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
 * Creates a validator that enforces a maximun length.
 *
 * @param max - Maximun number of characters/items.
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
    `Should contain at more than ${max} characters`;

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
 * Validates dates, ISO-like strings, millisecond timestamps, and Firestore
 * timestamp values.
 *
 * @param value - Value to validate.
 * @returns `true` when valid, otherwise an error message.
 */
export const isDate = (value: unknown): boolean | string => {
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
    else return 'Should be a Date';
    return (
      (date instanceof Date && Number.isFinite(date.getTime())) ||
      'Should be a Date'
    );
  } catch {
    return 'Should be a Date';
  }
};
