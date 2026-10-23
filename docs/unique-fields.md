# Unique fields

`@uniqueField` enforces uniqueness through a reservation collection:

```typescript
import { uniqueField, Validation } from 'fireobject';

@uniqueField({
  validators: [
    Validation.isRequired,
    Validation.isString,
    Validation.matches(/^[a-z0-9_-]{3,30}$/, 'Invalid username'),
  ],
  normalize: (value) => value.trim().toLowerCase(),
  reservationCollection: 'Usernames',
  allowOwnerId: true,
})
username!: string;
```

How it works:

1. The value is normalized and validated.
2. On save, the ORM opens a transaction.
3. It checks the reservation document
   `Usernames/{encodeURIComponent(value)}`.
4. If the reservation belongs to another document, it throws
   `UniqueFieldConflictError`.
5. If the value changed, the old reservation is released when it belongs to
   the same document.
6. The model and its reservations are committed atomically.

Options:

| Option | Type | Description |
| --- | --- | --- |
| `validators` | `ValidatorFn[]` | Validators applied to the field. |
| `normalize` | `(value: string) => string` | Optional normalization before validation. |
| `reservationCollection` | `string` | Collection used to reserve values. |
| `allowOwnerId` | `boolean` | Accept a value equal to the document id. |

`allowOwnerId` is useful for usernames that default to the Firebase UID.

Inherited unique fields are supported. A subclass field with the same name
overrides the parent configuration.
