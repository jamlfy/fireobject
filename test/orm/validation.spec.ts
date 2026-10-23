import * as Validation from '../../src/orm/validation';

it('rejects missing values and wrong types without throwing', () => {
  for (const value of [undefined, null, {}, [], 1, Symbol('invalid')]) {
    expect(Validation.isString(value)).not.toBe(true);
    expect(Validation.nonEmptyString()(value)).not.toBe(true);
    expect(Validation.isEmail(value)).not.toBe(true);
    expect(Validation.minLength(3)(value)).not.toBe(true);
    expect(Validation.matches(/^[a-z]+$/)(value)).not.toBe(true);
    if (typeof value !== 'number')
      expect(Validation.isDate(value)).not.toBe(true);
  }
});

it('checks non-empty strings and arrays with configurable error messages', () => {
  for (const value of ['', '   ', null])
    expect(Validation.nonEmptyString('required')(value)).toBe('required');
  expect(Validation.nonEmptyString()(' valid ')).toBe(true);
  expect(Validation.nonEmptyArray('providers required')([])).toBe(
    'providers required',
  );
  expect(Validation.nonEmptyArray()(['google'])).toBe(true);
  expect(Validation.nonEmptyArray()('google')).not.toBe(true);
  expect(Validation.minLength(3)('abc')).toBe(true);
});

it('does not retain state between global regexp validations', () => {
  const validate = Validation.matches(/^[a-z]+$/g);
  expect(validate('alice')).toBe(true);
  expect(validate('alice')).toBe(true);
  expect(validate('alice.')).not.toBe(true);
});

it('accepts valid dates and Firestore timestamps and handles invalid inputs', () => {
  const date = new Date('2024-01-01T00:00:00Z');
  for (const value of [
    date,
    date.toISOString(),
    date.getTime(),
    { toDate: () => date },
  ]) {
    expect(Validation.isDate(value)).toBe(true);
  }
  for (const value of [
    undefined,
    null,
    '',
    'invalid',
    new Date(NaN),
    { toDate: () => 'invalid' },
    {
      toDate: () => {
        throw new Error();
      },
    },
  ]) {
    expect(Validation.isDate(value)).toBe('Should be a Date');
  }
});
