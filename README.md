# fireobject

A small, decorator-based ORM for Google Cloud Firestore.

`fireobject` gives Firestore models a familiar class-based API: typed fields,
validation, unique fields backed by atomic reservations, references,
subcollections, parameterized collection paths, and transaction helpers.

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
- [Unique fields](#unique-fields)
- [References](#references)
- [Subcollections](#subcollections)
- [Queries](#queries)
- [Saving data](#saving-data)
- [Transactions and partial saves](#transactions-and-partial-saves)
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

Extend `FireObject` and implement `beforeSave`:

```typescript
import { FireObject, Validation, field } from 'fireobject';

export class Plan extends FireObject {
  @field([Validation.isRequired])
  declare id: string;

  @field([Validation.isRequired, Validation.nonEmptyString()])
  name!: string;

  @field([Validation.isDate])
  createdAt!: Date;

  async beforeSave(): Promise<void> {
    this.createdAt ??= new Date();
  }
}
```

`beforeSave` is abstract, so every model must implement it. It can be `async`,
and it runs before validation and before the Firestore write.

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

## Queries

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
- Uses `add()` when the document has no id; the generated id is assigned to
  `this.id` and the snapshot is refreshed.

Partial saves are supported:

```typescript
await user.save({ fields: ['name', 'updatedAt'] });
```

Only the listed fields are written. Unique fields are always included when
needed to keep reservations consistent.

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
