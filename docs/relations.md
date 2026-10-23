# Relations and subcollections

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
  team?: Promise<Team | null>;

  beforeSave(): void {}
}
```

Awaiting `user.team` hydrates the reference into a `Team` instance (or returns
`null` if the document no longer exists). Arrays of references are hydrated into
arrays of models.

Assigning a plain object converts it into a model instance. Assigning a
`DocumentReference` keeps the reference as-is.

### Eager loading

Use `populate()` to load reference-backed relations for several models in
parallel. Loaded models are cached on the instance, so later relation reads do
not perform another Firestore read:

```typescript
const users = await User.all();
await User.populate(users, 'team');

const team = await users[0].team; // cached Team instance
```

Call `populate(users)` without relation names to load every reference-backed
relation. Arrays are loaded as arrays, and references to missing documents
become `null` or are removed from relation arrays.

A single instance can load its relations with `load()`:

```typescript
const user = await User.findOrFail('alice');
await user.load('team');
```

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
