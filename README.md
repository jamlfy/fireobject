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

## Documentation

Start with [Requirements](#requirements), [Installation](#installation), and
[Quick start](#quick-start).

### Models and fields

- [How the ORM works](./docs/models.md#how-the-orm-works)
- [Defining a model](./docs/models.md#defining-a-model)
- [Connecting a model to Firestore](./docs/models.md#connecting-a-model-to-firestore)
- [Fields and validation](./docs/models.md#fields-and-validation)
- [Field options](./docs/models.md#field-options)
- [Hooks](./docs/models.md#hooks)
- [Unique fields](./docs/unique-fields.md)

### CRUD, queries, and relations

- [Static CRUD](./docs/crud.md#static-crud)
- [Saving data](./docs/crud.md#saving-data)
- [Document ids](./docs/crud.md#document-ids)
- [Queries](./docs/queries.md)
- [References](./docs/relations.md#references)
- [Subcollections](./docs/relations.md#subcollections)

### Lifecycle and atomic operations

- [Timestamps and soft deletes](./docs/lifecycle.md#timestamps-and-soft-deletes)
- [Transactions and partial saves](./docs/lifecycle.md#transactions-and-partial-saves)
- [Bulk operations, batches, and transactions](./docs/lifecycle.md#bulk-operations-batches-and-transactions)
- [Field values](./docs/field-values.md)

### Reference

- [Errors](./docs/errors.md)
- [Validation helpers](./docs/validation-helpers.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [MCP server](./docs/mcp.md)
- [Project scripts and development](./docs/development.md#project-scripts)
- [Publishing a release](./docs/development.md#publishing-a-release)

### AI agents

- [AGENTS.md](./AGENTS.md): repository commands, architecture, and conventions.
- [llms.txt](./llms.txt): compact documentation index.
- [llms-full.txt](./llms-full.txt): complete documentation in one file.

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

## License

MIT. See [LICENSE](./LICENSE).
