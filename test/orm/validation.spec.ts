import * as Validation from '../../src/orm/validation';

const invalidValues = [undefined, null, {}, [], 1, Symbol('invalid')];

describe('isRequired', () => {
  it('accepts zero and false values', () => {
    expect(Validation.isRequired(0)).toBe(true);
    expect(Validation.isRequired(false)).toBe(true);
  });

  it('rejects missing and empty values', () => {
    for (const value of [undefined, null, ''])
      expect(Validation.isRequired(value)).toBe('This field is required');
  });
});

describe('isString', () => {
  it('accepts strings', () => {
    expect(Validation.isString('alice')).toBe(true);
    expect(Validation.isString('')).toBe(true);
  });

  it('rejects missing and non-string values', () => {
    for (const value of invalidValues)
      expect(Validation.isString(value)).toBe('Should be a string');
  });
});

describe('isEmail', () => {
  it('accepts strings containing an at sign', () => {
    expect(Validation.isEmail('alice@example.com')).toBe(true);
  });

  it('rejects missing and malformed email values', () => {
    for (const value of [...invalidValues, 'alice.example.com'])
      expect(Validation.isEmail(value)).toBe('The format is not valid');
  });
});

describe('minLength', () => {
  it('accepts strings and arrays with enough items', () => {
    expect(Validation.minLength(3)('abc')).toBe(true);
    expect(Validation.minLength(2)(['a', 'b'])).toBe(true);
  });

  it('rejects short and non-sized values', () => {
    for (const value of [...invalidValues, 'ab'])
      expect(Validation.minLength(3)(value)).toBe(
        'Should contain at least 3 characters',
      );
  });
});

describe('maxLength', () => {
  it('accepts strings and arrays within the limit', () => {
    expect(Validation.maxLength(3)('abc')).toBe(true);
    expect(Validation.maxLength(1)([])).toBe(true);
  });

  it('rejects oversized and non-sized values', () => {
    expect(Validation.maxLength(3)('abcd')).toBe(
      'Should contain at most 3 characters',
    );
    expect(Validation.maxLength(2)(['a', 'b', 'c'])).toBe(
      'Should contain at most 2 characters',
    );
    expect(Validation.maxLength(3)(undefined)).toBe(
      'Should contain at most 3 characters',
    );
  });
});

describe('nonEmptyString', () => {
  it('accepts strings with visible characters', () => {
    expect(Validation.nonEmptyString()(' valid ')).toBe(true);
  });

  it('rejects empty, whitespace-only, and missing values', () => {
    for (const value of ['', '   ', null, undefined])
      expect(Validation.nonEmptyString('required')(value)).toBe('required');
  });

  it('uses the default message when none is provided', () => {
    expect(Validation.nonEmptyString()('')).toBe(
      'Should be a non-empty string',
    );
  });
});

describe('nonEmptyArray', () => {
  it('accepts arrays with at least one item', () => {
    expect(Validation.nonEmptyArray()(['google'])).toBe(true);
  });

  it('rejects empty arrays and non-array values', () => {
    expect(Validation.nonEmptyArray('providers required')([])).toBe(
      'providers required',
    );
    expect(Validation.nonEmptyArray()('google')).toBe(
      'Should be a non-empty array',
    );
  });
});

describe('matches', () => {
  it('accepts strings matching the pattern', () => {
    expect(Validation.matches(/^[a-z]+$/)('alice')).toBe(true);
  });

  it('rejects missing and non-matching values', () => {
    for (const value of [...invalidValues, 'Alice'])
      expect(Validation.matches(/^[a-z]+$/)(value)).toBe(
        'The format is not valid',
      );
  });

  it('does not retain state between global regexp validations', () => {
    const validate = Validation.matches(/^[a-z]+$/g);
    expect(validate('alice')).toBe(true);
    expect(validate('alice')).toBe(true);
    expect(validate('alice.')).not.toBe(true);
  });
});

describe('isDate', () => {
  it('accepts dates, ISO strings, millisecond timestamps, and Firestore timestamps', () => {
    const date = new Date('2024-01-01T00:00:00Z');
    for (const value of [
      date,
      date.toISOString(),
      date.getTime(),
      { toDate: () => date },
    ]) {
      expect(Validation.isDate(value)).toBe(true);
    }
  });

  it('rejects missing and invalid date values', () => {
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
});
