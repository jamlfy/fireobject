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

describe('isNumber', () => {
  it('accepts finite numbers', () => {
    for (const value of [0, -1, 1.5])
      expect(Validation.isNumber(value)).toBe(true);
  });

  it('rejects non-numbers and non-finite numbers', () => {
    for (const value of [
      undefined,
      null,
      {},
      [],
      Symbol('invalid'),
      NaN,
      Infinity,
      -Infinity,
      '1',
      true,
    ])
      expect(Validation.isNumber(value)).toBe('Should be a number');
  });
});

describe('isInteger', () => {
  it('accepts finite integers', () => {
    for (const value of [0, -2, 3])
      expect(Validation.isInteger(value)).toBe(true);
  });

  it('rejects decimals, non-finite numbers, and non-numbers', () => {
    for (const value of [
      undefined,
      null,
      {},
      [],
      Symbol('invalid'),
      1.5,
      NaN,
      Infinity,
      '1',
    ])
      expect(Validation.isInteger(value)).toBe('Should be an integer');
  });
});

describe('isBoolean', () => {
  it('accepts booleans', () => {
    expect(Validation.isBoolean(true)).toBe(true);
    expect(Validation.isBoolean(false)).toBe(true);
  });

  it('rejects non-boolean values', () => {
    for (const value of [...invalidValues, 'true', 0, 1])
      expect(Validation.isBoolean(value)).toBe('Should be a boolean');
  });
});

describe('isArray', () => {
  it('accepts arrays', () => {
    expect(Validation.isArray([])).toBe(true);
    expect(Validation.isArray(['a'])).toBe(true);
  });

  it('rejects non-array values', () => {
    for (const value of [undefined, null, {}, 'a', 1, true])
      expect(Validation.isArray(value)).toBe('Should be an array');
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

describe('isUrl', () => {
  it('accepts absolute HTTP and HTTPS URLs', () => {
    for (const value of [
      'https://example.com',
      'http://localhost:3000/path?q=1',
      'https://user:pass@example.com/path#hash',
    ])
      expect(Validation.isUrl(value)).toBe(true);
  });

  it('rejects relative, non-HTTP, and malformed URLs', () => {
    for (const value of [
      ...invalidValues,
      '',
      'example.com',
      'ftp://example.com',
      'not a url',
    ])
      expect(Validation.isUrl(value)).toBe('Should be a valid URL');
  });
});

describe('isUuid', () => {
  it('accepts UUID versions 1 through 8', () => {
    for (const value of [
      '550e8400-e29b-41d4-a716-446655440000',
      '6BA7B810-9DAD-11D1-80B4-00C04FD430C8',
      '00000000-0000-7000-8000-000000000000',
    ])
      expect(Validation.isUuid(value)).toBe(true);
  });

  it('rejects invalid versions, variants, and malformed values', () => {
    for (const value of [
      ...invalidValues,
      '',
      '550e8400-e29b-91d4-a716-446655440000',
      '550e8400-e29b-41d4-c716-446655440000',
      '550e8400e29b41d4a716446655440000',
    ])
      expect(Validation.isUuid(value)).toBe('Should be a UUID');
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

describe('minValue', () => {
  it('accepts numbers greater than or equal to the minimum', () => {
    expect(Validation.minValue(3)(3)).toBe(true);
    expect(Validation.minValue(3)(4)).toBe(true);
  });

  it('rejects smaller and non-numeric values', () => {
    for (const value of [2, '3', NaN, Infinity, undefined])
      expect(Validation.minValue(3)(value)).toBe(
        'Should be greater than or equal to 3',
      );
  });

  it('uses a custom error message', () => {
    expect(Validation.minValue(3, 'too small')(2)).toBe('too small');
  });
});

describe('maxValue', () => {
  it('accepts numbers less than or equal to the maximum', () => {
    expect(Validation.maxValue(3)(3)).toBe(true);
    expect(Validation.maxValue(3)(2)).toBe(true);
  });

  it('rejects larger and non-numeric values', () => {
    for (const value of [4, '3', NaN, Infinity, undefined])
      expect(Validation.maxValue(3)(value)).toBe(
        'Should be less than or equal to 3',
      );
  });

  it('uses a custom error message', () => {
    expect(Validation.maxValue(3, 'too large')(4)).toBe('too large');
  });
});

describe('oneOf', () => {
  it('accepts listed values using Object.is comparison', () => {
    const validate = Validation.oneOf(['draft', 'published', null, NaN]);
    for (const value of ['draft', 'published', null, NaN])
      expect(validate(value)).toBe(true);
  });

  it('rejects unlisted values', () => {
    const validate = Validation.oneOf(['draft', 'published']);
    for (const value of ['archived', '', undefined, 1])
      expect(validate(value)).toBe('Should be one of the allowed values');
  });

  it('uses a custom error message', () => {
    expect(Validation.oneOf(['a'], 'invalid status')('b')).toBe(
      'invalid status',
    );
  });
});

describe('cleanRef', () => {
  it('accepts values when the referenced field exists', () => {
    expect(
      Validation.cleanRef('owner')(undefined, new Map([['owner', 'user-1']])),
    ).toBe(true);
  });

  it('returns an error when the referenced field is missing or empty', () => {
    expect(Validation.cleanRef('owner')(undefined)).toBe(
      'Field owner does not exist',
    );
    expect(Validation.cleanRef('owner')(undefined, new Map())).toBe(
      'Field owner does not exist',
    );
    expect(
      Validation.cleanRef('owner')(undefined, new Map([['owner', '']])),
    ).toBe('Field owner does not exist');
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

describe('isFutureDate', () => {
  it('accepts future dates, strings, and timestamps', () => {
    const future = Date.now() + 60_000;
    for (const value of [new Date(future), new Date(future).toISOString(), future])
      expect(Validation.isFutureDate(value)).toBe(true);
  });

  it('rejects past, current, and invalid dates', () => {
    for (const value of [
      new Date(0),
      new Date(Date.now() - 60_000),
      'invalid',
      undefined,
    ])
      expect(Validation.isFutureDate(value)).toBe('Should be a future date');
  });
});

describe('isPastDate', () => {
  it('accepts past dates, strings, and timestamps', () => {
    const past = Date.now() - 60_000;
    for (const value of [new Date(past), new Date(past).toISOString(), past])
      expect(Validation.isPastDate(value)).toBe(true);
  });

  it('rejects future, current, and invalid dates', () => {
    for (const value of [
      new Date(Date.now() + 60_000),
      'invalid',
      undefined,
    ])
      expect(Validation.isPastDate(value)).toBe('Should be a past date');
  });
});
