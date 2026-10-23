export const isRequired = (value: unknown): boolean | string =>
  (value !== undefined && value !== null && value !== '') ||
  'This field is required';

export const isString = (value: unknown): boolean | string =>
  typeof value === 'string' || 'Should be a string';

export const isEmail = (value: unknown): boolean | string =>
  (typeof value === 'string' && value.includes('@')) ||
  'The format is not valid';

export const minLength =
  (minimum: number) =>
  (value: unknown): boolean | string =>
    ((typeof value === 'string' || Array.isArray(value)) &&
      value.length >= minimum) ||
    `Should contain at least ${minimum} characters`;

export const cleanRef =
  (reference: string) =>
  (_value: unknown, values?: Map<string, unknown>): boolean | string =>
    Boolean(values?.get(reference)) || `Field ${reference} does not exist`;

export const nonEmptyString =
  (message = 'Should be a non-empty string') =>
  (value: unknown): boolean | string =>
    (typeof value === 'string' && value.trim().length > 0) || message;

export const nonEmptyArray =
  (message = 'Should be a non-empty array') =>
  (value: unknown): boolean | string =>
    (Array.isArray(value) && minLength(1)(value) === true) || message;

export const matches =
  (pattern: RegExp, message = 'The format is not valid') =>
  (value: unknown): boolean | string =>
    (typeof value === 'string' &&
      new RegExp(pattern.source, pattern.flags).test(value)) ||
    message;

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
