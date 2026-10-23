# Errors

All library errors extend `FireObjectError` and expose a stable `code`:

| Error | Code | Meaning |
| --- | --- | --- |
| `ValidationError` | `VALIDATION_ERROR` | One or more fields are invalid. |
| `FieldValidationError` | `VALIDATION_ERROR` | A specific field failed validation. |
| `NotFoundError` | `NOT_FOUND` | `findOrFail` or `update` found no document. |
| `ConflictError` | `CONFLICT` | A write conflicts with existing data. |
| `UniqueFieldConflictError` | `CONFLICT` | A unique reservation belongs to another document. |
| `QueryError` | `QUERY_ERROR` | A Firestore query failed. |
| `TransactionError` | `TRANSACTION_ERROR` | A transaction could not be completed. |

```typescript
import { NotFoundError } from 'fireobject';

try {
  await User.findOrFail('missing');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log(error.collection, error.id); // "Users" "missing"
  }
}
```
