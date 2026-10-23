# fireobject

A small, decorator-based ORM for Google Cloud Firestore.

`fireobject` gives Firestore models a familiar class-based API: typed fields,
validation, static CRUD helpers, a chainable query builder, lifecycle hooks,
automatic timestamps, soft deletes, unique fields backed by atomic reservations,
references, subcollections, parameterized collection paths, bulk operations, and
transaction helpers.

- Works with `@google-cloud/firestore` (Node.js).
- Written in TypeScript and published with ESM + CommonJS builds.
- No runtime dependency other than the Firestore client (peer dependency).
- Uses legacy TypeScript decorators.

---

## Table of contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Project scripts](#project-scripts)
- [How the ORM works](#how-the-orm-works)
- [Defining a model](#defining-a-model)
- [Connecting a model to Firestore](#connecting-a-model-to-firestore)
- [Fields and validation](#fields-and-validation)
- [Field options](#field-options)
- [Hooks](#hooks)
- [Unique fields](#unique-fields)
- [References](#references)
- [Subcollections](#subcollections)
- [Static CRUD](#static-crud)
- [Queries](#queries)
- [Saving data](#saving-data)
- [Timestamps and soft deletes](#timestamps-and-soft-deletes)
- [Transactions and partial saves](#transactions-and-partial-saves)
- [Bulk operations, batches, and transactions](#bulk-operations-batches-and-transactions)
- [Field values](#field-values)
- [Errors](#errors)
- [Document ids](#document-ids)
- [Validation helpers](#validation-helpers)
- [Development](#development)
- [Publishing a release](#publishing-a-release)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Requirements

- Node.js 18 or newer.
- TypeScript 5.x.
- A Google Cloud project with Firestore enabled, or the Firestore emulator.
- `@google-cloud/firestore` installed in your application.

The library uses legacy decorators, so your application must enable them:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

`useDefineForClassFields: false` is important. With the default `true` in modern
targets, class fields can shadow the accessors installed by `@field` on the
prototype.

---

## Installation

```bash
npm install fireobject @google-cloud/firestore
# or
pnpm add fireobject @google-cloud/firestore
# or
yarn add fireobject @google-cloud/firestore
```

`@google-cloud/firestore` is a peer dependency, so it must be installed by the
application and should not be duplicated in the dependency tree.

---

## Quick start

```typescript
import { Firestore } from '@google-cloud/firestore';
import {
  Connector,
  FireObject,
  Validation,
  field,
  uniqueField,
} from 'fireobject';

const db = new Firestore({ projectId: 'my-project' });

@Connector(db, 'Users/:user')
export class User extends FireObject {
  @field([Validation.isRequired, Validation.nonEmptyString()])
  declare id: string;

  @uniqueField({
    validators: [
      Validation.isRequired,
      Validation.isString,
      Validation.isEmail,
    ],
    normalize: (value) => value.trim().toLowerCase(),
    reservationCollection: 'UserEmails',
  })
  email!: string;

  @field([Validation.isRequired, Validation.minLength(2)])
  name!: string;

  @field([Validation.isDate])
  createdAt!: Date;

  beforeSave(): void {
    this.createdAt ??= new Date();
  }
}

const user = new User({
  id: 'alice',
  email: 'Alice@Example.com',
  name: 'Alice',
});

await user.save();

console.log(user.email); // "alice@example.com"
console.log(user.exists); // true
console.log(user.ref?.path); // "Users/alice"
```

---

## Project scripts

```bash
pnpm install          # install dependencies
pnpm run typecheck    # TypeScript type checking (tsc --noEmit)
pnpm run test         # run the Vitest suite once
pnpm run test:watch   # run tests in watch mode
pnpm run build        # build ESM, CommonJS, and declarations with tsup
pnpm run dev          # rebuild on changes
npm pack --dry-run    # inspect the files that would be published
```

`prepublishOnly` runs `typecheck`, `test`, and `build` automatically before a
manual `npm publish`.

---

## How the ORM works

`FireObject` keeps model values in an internal `WeakMap` instead of assigning
them directly to the instance. The `@field` decorator installs getters and
setters on the prototype:

- The getter reads from the internal state.
- The setter normalizes the value, runs validators, and records the first
  error.
- `data()` serializes the internal state into plain Firestore data.
- `getErrors()` and `isValid()` expose validation results without throwing.

A model is bound to a database and collection with `@Connector`. The decorator
stores static metadata (`Firestore`, `Collection`, `CollectionPattern`, and
optionally `ParentCollection`) on the class.

There is no global database singleton. Every model must receive its Firestore
instance through `@Connector`, which makes the library safe to use with multiple
projects, emulators, or test doubles.

---

## Defining a model

Extend `FireObject` with a data interface to type field names and CRUD inputs:

```typescript
import { FireObject, Validation, field } from 'fireobject';

interface PlanData {
  id: string;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Plan extends FireObject<PlanData> {
  @field([Validation.isRequired])
  declare id: string;

  @field([Validation.isRequired, Validation.nonEmptyString()])
  name!: string;

  @field([Validation.isDate])
  createdAt?: Date;

  @field([Validation.isDate])
  updatedAt?: Date;
}
```

`beforeSave`, `beforeCreate`, and `beforeUpdate` are optional and can be
`async`. They run before validation and before the Firestore write. See
[Hooks](#hooks).

Plain fields are optional by design: they can be `undefined` until assigned.
`data()` omits `undefined` values, so Firestore only receives fields that were
actually set. `null` values are preserved.

---

## Connecting a model to Firestore

### Firestore instance plus a collection pattern

```typescript
import { Firestore } from '@google-cloud/firestore';
import { Connector, FireObject } from 'fireobject';

const db = new Firestore();

@Connector(db, 'Users/:user')
export class User extends FireObject {
  // ...
}
```

The pattern uses `:name` placeholders. The final placeholder is the document id
when the model is saved. Earlier placeholders must be present as instance
properties.

### A fixed collection

```typescript
@Connector(db, 'Products')
export class Product extends FireObject {
  // ...
}
```

With a fixed collection, the decorator stores a ready-to-use `Collection`
reference.

### Nested paths

```typescript
@Connector(db, 'Packages/:parent/Versions/:version')
export class Version extends FireObject {
  @field() declare parent: string;
  @field() declare id: string;
  // ...
}
```

When saving a `Version`, `parent` and `id` are used to build the path. To read
the collection you can pass both values explicitly:

```typescript
const collection = Version.collection({
  parent: 'demo',
  version: '1.0.0',
});
// Document: Packages/demo/Versions/1.0.0
```

### Existing collection or collection group

```typescript
@Connector(db.collection('Users'))
export class User extends FireObject {
  // ...
}
```

This overload also stores the collection's Firestore instance, so
`collectionGroup()` works as long as a pattern can be derived from the
collection path.

### Collection groups

```typescript
const snapshot = await Version.collectionGroup()
  .where('publishedBy', '==', userId)
  .get();

const versions = snapshot.docs.map((doc) => doc.data());
```

`collectionGroup()` uses the last collection segment of the model pattern.

---

## Fields and validation

Use `@field` to declare a property:

```typescript
@field([Validation.isRequired, Validation.isString])
name!: string;

@field([Validation.isDate])
createdAt!: Date;

@field()
tags?: string[];
```

Validators receive `(value, values)`:

- `value` is the normalized value being assigned.
- `values` is a `Map` containing the current field values of the instance.

Return `true` when valid. Return `false` or a string to mark the field invalid.
When a string is returned it is used as the error message:

```typescript
@field([
  (value: unknown) =>
    (typeof value === 'string' && value.length >= 3) ||
    'Name must have at least 3 characters',
])
name!: string;
```

Validation does not throw on assignment. Check the result with:

```typescript
const errors = user.getErrors(); // { email: 'The format is not valid' }
const valid = user.isValid();    // false
```

Nested model hydration is also supported:

```typescript
@field([], () => Address)
address!: Address;
```

The second argument can be a class or a thunk (`() => Address`) to avoid
circular imports. Plain objects are converted into model instances on read.

Firestore `Timestamp` values (and plain `{ seconds, nanoseconds }` objects) are
automatically normalized to `Date` when assigned or loaded from a snapshot.

---

## Field options

Pass an options object instead of a validator array:

```typescript
@field({
  validators: [Validation.isRequired, Validation.isString],
  nullable: false,
  immutable: true,
})
email!: string;

@field({ default: 'member' })
role?: string;

@field({
  serialize: (value) => String(value).trim().toLowerCase(),
  deserialize: (value) => String(value),
})
slug?: string;
```

| Option | Type | Description |
| --- | --- | --- |
| `validators` | `ValidatorFn[]` | Validators applied to the field. |
| `subDocType` | model or thunk | Hydrates nested plain objects into models. |
| `default` | value or `() => value` | Applied when a new model omits the field. |
| `serialize` | `(value, values) => unknown` | Converts the in-memory value before writing. |
| `deserialize` | `(value, values) => unknown` | Converts a loaded value before normalization. |
| `nullable` | `boolean` | When `false`, rejects `null` and `undefined` on save. |
| `immutable` | `boolean` | Rejects changes after the document has been persisted. |

The legacy signature `@field(validators, subDocType)` remains supported.

---

## Hooks

Lifecycle hooks are optional methods on the model:

```typescript
class User extends FireObject<UserData> {
  beforeSave() {}
  beforeCreate() {}
  afterCreate() {}
  beforeUpdate() {}
  afterUpdate() {}
  beforeDelete() {}
  afterDelete() {}
  afterSave() {}
}
```

| Hook | When it runs |
| --- | --- |
| `beforeSave` | Before every save, after automatic timestamps are applied. |
| `beforeCreate` | Before creating a new document. |
| `afterCreate` | After a document is created. |
| `beforeUpdate` | Before updating an existing document. |
| `afterUpdate` | After an existing document is updated. |
| `beforeDelete` | Before a hard or soft delete. |
| `afterDelete` | After a hard or soft delete. |
| `afterSave` | After every successful save. |

Hooks can be `async`. `prepareSave()` runs pre-write hooks and leaves
post-write hooks to `save()`.

---

## Unique fields

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

---

## References

Use `@reference` for relations backed by `DocumentReference` values:

```typescript
import { Connector, FireObject, reference, Validation, field } from 'fireobject';

@Connector(db, 'Teams/:team')
export class Team extends FireObject {
  @field([Validation.isRequired])
  declare id: string;

  beforeSave(): void {}
}

@Connector(db, 'Users/:user')
export class User extends FireObject {
  @reference(() => Team)
  team?: Team | null;

  beforeSave(): void {}
}
```

Reading `user.team` hydrates the reference into a `Team` instance (or returns
`null` if the document no longer exists). Arrays of references are hydrated into
arrays of models.

Assigning a plain object converts it into a model instance. Assigning a
`DocumentReference` keeps the reference as-is.

---

## Subcollections

Use `@Subcollection` for read-only virtual properties:

```typescript
import { Connector, FireObject, Subcollection, Validation, field } from 'fireobject';

@Connector(db, 'Packages/:parent/Versions/:version')
export class Version extends FireObject {
  @field() declare parent: string;
  @field() declare id: string;

  beforeSave(): void {}
}

@Connector(db, 'Packages/:parent')
export class Package extends FireObject {
  @field() declare id: string;

  @Subcollection(() => Version, 'parent', (pkg) => `Packages/${pkg.id}`)
  versions!: Promise<Version[]>;

  beforeSave(): void {}
}
```

The getter calls `Version.queryByPath({ parent: ... })`. The default parameter
resolver uses the owner `id`; pass a custom function when the related pattern
expects a full parent path.

Subcollection properties are read-only.

---

## Static CRUD

Every model exposes typed static helpers:

```typescript
const user = await User.find('alice');          // User | null
const user = await User.findOrFail('alice');    // throws NotFoundError
const users = await User.all();                 // User[]
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

For parameterized collections, pass the non-document path placeholders:

```typescript
await Version.find('1.0.0', { package: 'demo' });
await Version.all({ package: 'demo' });
```

---

## Queries

### Query builder

```typescript
const users = await User.where('active', '==', true)
  .orderBy('createdAt', 'desc')
  .limit(50)
  .get();

const first = await User.where('email', '==', email).first();
const total = await User.where('active', '==', true).count();
```

Supported builder methods: `where`, `orderBy`, `limit`, `offset`, `startAt`,
`startAfter`, `endBefore`, `endAt`, `get`, `first`, `count`, and `paginate`.

Cursor pagination returns the next cursor and a `hasMore` flag:

```typescript
const page = await User.orderBy('createdAt').paginate(25);

const next = await User.orderBy('createdAt').paginate({
  limit: 25,
  startAfter: page.nextCursor,
});
```

`where` field names are restricted to `keyof` the model data interface.

### Query with constraints

```typescript
import { Query } from '@google-cloud/firestore';

const active = await User.query(
  (query: Query<User>) => query.where('active', '==', true),
  (query: Query<User>) => query.orderBy('createdAt', 'desc'),
  (query: Query<User>) => query.limit(50),
);
```

### Query a parameterized path

```typescript
const versions = await Version.queryByPath(
  { parent: 'Packages/demo' },
  (query) => query.orderBy('createdAt', 'desc'),
);
```

### Use the collection directly

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

---

## Field values

Firestore sentinel helpers are available directly and under the `FieldValue`
namespace:

```typescript
import {
  FieldValue,
  arrayRemove,
  arrayUnion,
  deleteField,
  increment,
  serverTimestamp,
} from 'fireobject';

await User.collection().doc('alice').update({
  visits: increment(1),
  tags: arrayUnion('beta'),
  updatedAt: serverTimestamp(),
  legacyField: deleteField(),
});
```

Sentinels are passed through by `data()`, so Firestore applies them atomically
when they are used in native Firestore writes.

---

## Errors

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

---

## Document ids

Firestore document ids cannot contain `/`. Use `documentId()` to encode values:

```typescript
User.documentId('@scope/package'); // "%40scope%2Fpackage"
```

The ORM uses the same encoding when saving and when resolving referenced ids.

---

## Validation helpers

Available under the `Validation` namespace:

| Helper | Description |
| --- | --- |
| `isRequired` | Rejects `undefined`, `null`, and `''`. |
| `isString` | Requires a string. |
| `isEmail` | Requires a string containing `@`. |
| `minLength(n)` | Requires a string or array with at least `n` items. |
| `maxLength(n)` | Requires a string or array with at most `n` items. |
| `cleanRef(field)` | Requires another field to have a value. |
| `nonEmptyString(message?)` | Requires a non-empty, non-whitespace string. |
| `nonEmptyArray(message?)` | Requires a non-empty array. |
| `matches(regexp, message?)` | Requires a string matching the regexp. |
| `isDate` | Accepts `Date`, ISO-like strings, timestamps, and Firestore timestamps. |

You can always write custom validators as plain functions.

---

## Development

### Install dependencies

```bash
pnpm install
```

The repository includes a `pnpm-lock.yaml`. CI uses:

```bash
pnpm install --frozen-lockfile
```

### Run checks locally

```bash
pnpm run typecheck
pnpm run test
pnpm run build
npm pack --dry-run
```

### Test with the Firestore emulator

Install and start the emulator, then point your app or tests at it:

```bash
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

The library itself does not start the emulator. The consuming application is
responsible for configuring Firestore.

### Build output

```text
dist/
├── index.js          # ESM
├── index.cjs         # CommonJS
├── index.d.ts        # ESM types
├── index.d.cts       # CommonJS types
└── orm/
    └── ...           # subpath build for `fireobject/orm`
```

`package.json` exposes both entry points:

```typescript
import { FireObject } from 'fireobject';
// or
import { FireObject } from 'fireobject/orm';
```

### How the package selects JS or TypeScript

The published package contains compiled JavaScript and the original TypeScript
sources. The consumer's tool decides which entry to use through the standard
`package.json` conditions:

| Consumer | `package.json` field/condition | File |
| --- | --- | --- |
| Node.js ESM | `exports["."].import` | `dist/index.js` |
| Node.js CommonJS | `exports["."].require` | `dist/index.cjs` |
| TypeScript ESM | `exports["."].import.types` | `dist/index.d.ts` |
| TypeScript CommonJS | `exports["."].require.types` | `dist/index.d.cts` |
| Bundlers with `source` support | top-level `source` | `src/index.ts` |
| TypeScript versions without `exports` support | `typesVersions` | `dist/index.d.ts` |

Node.js never executes TypeScript directly. TypeScript reads the declaration
files during type checking, while the runtime loads the compiled `.js` or
`.cjs` file. The `src` directory is included so source maps and bundlers that
understand the `source` field can work with the original `.ts` code.

The same conditions are available for the `fireobject/orm` subpath.

### Type checking and decorators

The package compiles with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

Consumers must also enable `experimentalDecorators` for their own models.

---

## Publishing a release

Publishing is automated by `.github/workflows/publish.yml`.

### One-time setup

1. Create an npm automation token with publish access.
2. Add it to the GitHub repository as the `NPM_TOKEN` secret.
3. Ensure the package name is available on npm. This package uses
   `fireobject`.

### Release flow

1. Update the version in `package.json`:

   ```bash
   pnpm version patch
   # or: pnpm version minor
   # or: pnpm version major
   ```

2. Push the commit and the tag:

   ```bash
   git push origin main
   git push origin v0.1.1
   ```

3. The publish workflow will:
   - Check out the tag.
   - Install dependencies with a frozen lockfile.
   - Verify that the tag matches `package.json` (for example, `v0.1.1` must
     match `"version": "0.1.1"`).
   - Run type checking, tests, and the build.
   - Publish to npm.
   - Create a GitHub Release and attach the packed `.tgz`.

If the tag and the package version do not match, the workflow fails before
publishing.

### CI

`.github/workflows/ci.yml` runs on every push to `main`, every pull request, and
manually. It tests Node.js 20, 22, and 24 and runs:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test
pnpm run build
npm pack --dry-run
```

### Manual publish

```bash
pnpm run typecheck
pnpm run test
pnpm run build
npm publish --access public
```

`prepublishOnly` repeats the checks before a manual publish.

---

## Troubleshooting

### `Firestore instance not configured`

The model was not decorated with `@Connector(db, ...)`, or the decorator
received a collection without an accessible `firestore` property.

Use:

```typescript
@Connector(db, 'Users/:user')
```

### `Missing param "..." for path "..."`

A parameterized collection was used without providing all placeholders:

```typescript
User.collection({ user: 'alice' });
```

Pass every placeholder, or use `queryByPath` / a model instance that has the
required properties.

### Fields are not validated

Check that the model property uses `@field` and that your `tsconfig.json` has
`experimentalDecorators: true` and `useDefineForClassFields: false`.

### `UniqueFieldConflictError`

Another document already owns the reservation. Inspect the reservation
collection (`Usernames/{value}` in the examples) and the stored document.

### Type errors in consumer projects

Make sure there is only one copy of `@google-cloud/firestore`. Because it is a
peer dependency, use your package manager's deduplication or overrides if
needed.

---

## License

MIT. See [LICENSE](./LICENSE).
