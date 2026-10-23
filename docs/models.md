# Models and fields

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
