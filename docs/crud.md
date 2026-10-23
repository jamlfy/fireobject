# CRUD and persistence

## Static CRUD

Every model exposes typed static helpers:

```typescript
const user = await User.find('alice');          // User | null
const user = await User.findOrFail('alice');    // throws NotFoundError
const users = await User.all();                 // User[]
const selected = await User.findMany(['alice', 'bob']);
const exists = await User.exists('alice');      // boolean
const total = await User.count();               // number

const created = await User.create({ name: 'Alice' });        // auto id
const withId = await User.create({ name: 'Alice' }, 'alice'); // explicit id
const updated = await User.update('alice', { name: 'Alicia' });
const upserted = await User.upsert({ id: 'alice', name: 'Alice' });
const deleted = await User.delete('alice');                  // boolean
```

`create`, `update`, `upsert`, and `delete` run the normal save/delete hooks and
validation. `create()` uses Firestore's atomic create semantics: if the id
already exists it throws `ConflictError` instead of overwriting the document.
The second argument accepts either an id string or an options object:

```typescript
await User.create({ name: 'Alice' }, { id: 'alice' });
await User.update('alice', { name: 'Alicia' }, { params: { tenant: 'acme' } });
```

`findMany()` fetches ids in chunks of 30, preserves input order, and omits
missing documents.

For parameterized collections, pass the non-document path placeholders:

```typescript
await Version.find('1.0.0', { package: 'demo' });
await Version.all({ package: 'demo' });
```

---

## Saving data

```typescript
const user = new User({ id: 'alice', name: 'Alice' });
await user.save();
```

`save()` behavior:

- Runs `beforeSave`.
- Applies validation checks for unique fields.
- Updates an existing document when the instance came from a snapshot.
- Uses `set()` when the document has an id but no snapshot.
- Uses `create()` and throws `ConflictError` when `{ create: true }` is passed
  and the document already exists.
- Uses `add()` when the document has no id; the generated id is assigned to
  `this.id` and the snapshot is refreshed.

Partial saves are supported:

```typescript
await user.save({ fields: ['name', 'updatedAt'] });
```

Only the listed fields are written. Unique fields are always included when
needed to keep reservations consistent.

---

## Document ids

Firestore document ids cannot contain `/`. Use `documentId()` to encode values:

```typescript
User.documentId('@scope/package'); // "%40scope%2Fpackage"
```

The ORM uses the same encoding when saving and when resolving referenced ids.
