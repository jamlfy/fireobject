# fireobject

Firestore ORM with decorators for Google Cloud Firestore.

## Features

- `@Connector` to bind models to collections or collection groups with parameterized paths
- `@field` for typed properties with validation
- `@uniqueField` for atomic uniqueness with reservation collections
- `@Subcollection` and `@reference` for relations
- `FireObject` base class with `save()`, `prepareSave()`, `query()`, `queryByPath()`
- Automatic normalization of Firestore Timestamps
- Partial updates with field selection

## Installation

```bash
npm install fireobject @google-cloud/firestore
# or
pnpm add fireobject @google-cloud/firestore
# or
yarn add fireobject @google-cloud/firestore
```

## Configuration

```typescript
import { Firestore } from '@google-cloud/firestore';
import { setFirestore } from 'fireobject';

const db = new Firestore({ projectId: 'your-project' });
setFirestore(db);
```

## Usage

```typescript
import { Connector, FireObject, field, Validation, uniqueField } from 'fireobject';

@Connector('Users/:user')
export class User extends FireObject {
  @field([Validation.isRequired])
  declare id: string;

  @uniqueField({
    validators: [Validation.isRequired, Validation.isEmail],
    normalize: (v) => v.trim().toLowerCase(),
    reservationCollection: 'UserEmails',
  })
  email!: string;

  @field([Validation.minLength(2)])
  name!: string;

  async beforeSave() {
    // ...
  }
}

const user = new User({ id: 'alice', email: 'alice@example.com', name: 'Alice' });
await user.save();
```

## TypeScript Configuration

This library uses decorators. Ensure your `tsconfig.json` has:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

## API

See [source](https://github.com/jamlfy/fireobject) for full API including `Validation`, `Subcollection`, `reference`, and transaction helpers.

## License

MIT
