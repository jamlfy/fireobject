# Validation helpers

Available under the `Validation` namespace:

| Helper | Description |
| --- | --- |
| `isRequired` | Rejects `undefined`, `null`, and `''`. |
| `isString` | Requires a string. |
| `isNumber` | Requires a finite number (`NaN` and infinities are rejected). |
| `isInteger` | Requires a finite integer. |
| `isBoolean` | Requires a boolean. |
| `isArray` | Requires an array. |
| `isEmail` | Requires a string containing `@`. |
| `isUrl` | Requires an absolute HTTP(S) URL. |
| `isUuid` | Requires an RFC 4122 UUID (versions 1-8). |
| `minLength(n)` | Requires a string or array with at least `n` items. |
| `maxLength(n)` | Requires a string or array with at most `n` items. |
| `minValue(n, message?)` | Requires a finite number greater than or equal to `n`. |
| `maxValue(n, message?)` | Requires a finite number less than or equal to `n`. |
| `oneOf(values, message?)` | Requires a value from the list, compared with `Object.is`. |
| `cleanRef(field)` | Requires another field to have a value. |
| `nonEmptyString(message?)` | Requires a non-empty, non-whitespace string. |
| `nonEmptyArray(message?)` | Requires a non-empty array. |
| `matches(regexp, message?)` | Requires a string matching the regexp. |
| `isDate` | Accepts `Date`, ISO-like strings, timestamps, and Firestore timestamps. |
| `isFutureDate` | Requires a date after the current time. |
| `isPastDate` | Requires a date before the current time. |

## Common combinations

```typescript
import { FireObject, Validation, field } from 'fireobject';

export class Product extends FireObject {
  @field([
    Validation.isRequired,
    Validation.nonEmptyString(),
    Validation.minLength(3),
  ])
  name!: string;

  @field([Validation.isNumber, Validation.minValue(0)])
  price!: number;

  @field([Validation.isInteger, Validation.minValue(1)])
  stock!: number;

  @field([Validation.isUrl])
  website!: string;

  @field([Validation.isUuid])
  externalId!: string;

  @field([Validation.oneOf(['draft', 'published', 'archived'])])
  status!: string;

  @field([Validation.isFutureDate])
  publishAt!: Date;
}
```

The `message` argument on factory validators replaces the default error text:

```typescript
@field([Validation.minValue(18, 'Must be 18 or older')])
age!: number;
```

You can always write custom validators as plain functions.
