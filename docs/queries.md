# Queries

## Query builder

```typescript
const users = await User.where('active', '==', true)
  .orderBy('createdAt', 'desc')
  .limit(50)
  .get();

const first = await User.where('email', '==', email).first();
const total = await User.where('active', '==', true).count();
```

Supported builder methods: `where`, `orderBy`, `limit`, `offset`, `startAt`,
`startAfter`, `endBefore`, `endAt`, `get`, `first`, `exists`, `count`, and
`paginate`.

## Composed filters

Use Firestore `Filter` for `AND` / `OR` groups. `Filter` is re-exported by the
package, so no extra import from the Firestore SDK is needed:

```typescript
import { Filter } from 'fireobject';

const users = await User.where(
  Filter.or(
    Filter.where('active', '==', true),
    Filter.where('role', '==', 'admin'),
  ),
).get();

const exact = await User.where(
  Filter.and(
    Filter.where('active', '==', true),
    Filter.where('role', '==', 'admin'),
  ),
).get();
```

Use `exists()` when you only need to know whether a query has results:

```typescript
const hasActiveUsers = await User.where('active', '==', true).exists();
```

Cursor pagination returns the next cursor and a `hasMore` flag:

```typescript
const page = await User.orderBy('createdAt').paginate(25);

const next = await User.orderBy('createdAt').paginate({
  limit: 25,
  startAfter: page.nextCursor,
});
```

`where` field names are restricted to `keyof` the model data interface.

## Query with constraints

```typescript
import { Query } from '@google-cloud/firestore';

const active = await User.query(
  (query: Query<User>) => query.where('active', '==', true),
  (query: Query<User>) => query.orderBy('createdAt', 'desc'),
  (query: Query<User>) => query.limit(50),
);
```

## Query a parameterized path

```typescript
const versions = await Version.queryByPath(
  { parent: 'Packages/demo' },
  (query) => query.orderBy('createdAt', 'desc'),
);
```

## Use the collection directly

For more control, use the collection reference:

```typescript
const snapshot = await User.collection()
  .where('email', '==', 'alice@example.com')
  .limit(1)
  .get();

const user = snapshot.docs[0]?.data() as User | undefined;
```

Collections returned by `collection()` are bound to the model converter, so
`doc.data()` returns `User` instances.
