# Lifecycle and atomic operations

## Timestamps and soft deletes

Both features are opt-in per model.

### Automatic timestamps

```typescript
class User extends FireObject<UserData> {
  static timestamps = true;

  @field() declare createdAt?: Date;
  @field() declare updatedAt?: Date;
}
```

`createdAt` is set on creation and `updatedAt` on every save. Custom field names
are supported:

```typescript
static timestamps = { createdAt: 'created', updatedAt: 'modified' };
```

### Soft deletes

```typescript
class User extends FireObject<UserData> {
  static softDelete = true;

  @field() declare deletedAt?: Date;
}
```

With soft deletes enabled, `save()` is unchanged but `delete()` writes
`deletedAt` instead of removing the document. Use `{ hard: true }` to delete
permanently:

```typescript
await user.delete();                 // soft delete
await User.delete('alice');          // soft delete
await User.delete('alice', { hard: true });
await user.restore();                // removes deletedAt
```

The default field is `deletedAt`; customize it with
`static softDelete = { field: 'removedAt', value: new Date() }`.

Soft-deleted documents remain visible to queries. Filter them explicitly when
your application needs to hide them.

---

## Transactions and partial saves

`prepareSave()` lets you integrate the ORM with an existing transaction:

```typescript
await db.runTransaction(async (transaction) => {
  const user = new User({ id: 'alice', name: 'Alice' });
  const write = await user.prepareSave(transaction, {
    fields: ['name'],
  });

  // Perform any other transaction reads before calling write().
  await transaction.get(db.doc('Other/read'));

  write();
});
```

Important: call `write()` only after all transaction reads. Firestore requires
reads before writes.

`prepareSave` options:

| Option | Type | Description |
| --- | --- | --- |
| `reference` | `DocumentReference` | Override the document reference. |
| `fields` | `string[]` | Write only these fields. |
| `create` | `boolean` | Use `transaction.create` instead of update/set. |

Errors:

- `FieldValidationError` when a unique field is invalid.
- `UniqueFieldConflictError` when a reservation belongs to another document.

---

## Bulk operations, batches, and transactions

```typescript
const users = await User.createMany([
  { name: 'Alice' },
  { name: 'Bob' },
]);

await User.saveMany(users);
await User.saveMany(users, { fields: ['name'] });
const deleted = await User.deleteMany(['alice', 'bob']); // count
await User.deleteMany(['alice', 'bob'], { hard: true });
```

Bulk helpers run in order and preserve hooks and unique-field guarantees.

Use a native `WriteBatch` when you do not need ORM hook semantics:

```typescript
const batch = User.batch();
batch.set(User.collection().doc('alice'), { name: 'Alice' });
batch.delete(User.collection().doc('bob'));
await batch.commit();
```

Run a Firestore transaction through the model to reuse its configured database:

```typescript
const result = await User.transaction(
  async (transaction) => {
    const snapshot = await transaction.get(User.collection().doc('alice'));
    return snapshot.exists;
  },
  { maxAttempts: 5 },
);
```
