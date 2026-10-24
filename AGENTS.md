# AGENTS.md

This file is for AI coding agents working on the `fireobject` repository.

## Project

`fireobject` is a TypeScript ORM for Google Cloud Firestore. It provides
decorator-based models, typed CRUD, validation, a query builder, lifecycle
hooks, timestamps, soft deletes, unique fields, references, subcollections,
transactions, batch writes, and bulk helpers.

- Runtime: Node.js 18 or newer.
- Peer dependency: `@google-cloud/firestore` (`>=7 <9`).
- Build: `tsup` with ESM, CommonJS, and declaration outputs.
- Tests: Vitest with an in-memory fake Firestore.
- Decorators: legacy TypeScript decorators.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test
pnpm run build
npm pack --dry-run
pnpm run mcp
pnpm run docs:llms
```

Run `typecheck`, the full test suite, and `build` before considering code
changes complete. Documentation-only changes should still keep `docs:llms`
outputs current.

## Repository map

- `src/orm/object.ts`: `FireObject` base class, static CRUD, saving, hooks,
  query entry points, relations, soft deletes, and bulk operations.
- `src/orm/query.ts`: chainable `QueryBuilder`, including filters, cursors,
  pagination, counts, and `exists()`.
- `src/orm/validation.ts`: built-in validation helpers.
- `src/orm/field.ts`: `@field` decorator and runtime validation behavior.
- `src/orm/reference.ts`: `@reference` decorator and relation metadata.
- `src/orm/unique-field.ts`: atomic unique field reservations.
- `src/orm/errors.ts`: public error hierarchy.
- `src/orm/types.ts`: public model, CRUD, query, and field types.
- `src/orm/index.ts`: public ORM entry point.
- `test/orm/helpers/fake-firestore.ts`: in-memory Firestore fake used by tests.
- `test/orm/*.spec.ts`: behavior tests, grouped by function or feature.
- `docs/*.md`: user documentation split by section.
- `mcp/server.mjs`: read-only MCP server exposing the docs and a search tool.
- `scripts/build-llms.mjs`: generates `llms.txt` and `llms-full.txt`.

## Architecture rules

- `FireObject` stores values in a `WeakMap`, not on the instance.
- `@field` installs prototype accessors; assignments normalize values, run
  validators, and record the first error.
- `data()` omits `undefined`, preserves `null`, serializes nested models, and
  must pass native Firestore `FieldValue` sentinels through untouched.
- Models receive their database through `@Connector`; there is no global
  Firestore singleton.
- `create()` uses atomic create semantics and throws `ConflictError` when the
  document already exists.
- Unique fields use reservation documents and transactions.
- Public errors extend `FireObjectError` and expose stable `code` values.
- The package has no runtime dependencies besides the Firestore peer dependency.

## Coding conventions

- Keep strict TypeScript compatibility.
- Use legacy decorators and keep `useDefineForClassFields: false`.
- Do not wrap, replace, or re-export `FieldValue`; users import it directly
  from `@google-cloud/firestore`.
- Validators return `true` or an error string.
- Preserve the public API and existing error messages unless a change is
  explicitly requested.
- Prefer small focused modules and explicit types.
- Do not add runtime dependencies without a clear need.
- Do not commit secrets, tokens, local `.env` files, or generated credentials.

## Testing conventions

- Group tests by function or behavior.
- Every validator group must include a success case and an error case.
- Keep test files under 600 lines; create another file when a file grows beyond
  that limit.
- Use the shared fake Firestore and model fixtures rather than hitting a real
  project.
- Add regression tests for every behavior change.
- Keep `pnpm run test` deterministic and independent of real time where
  possible.

## Documentation conventions

- User documentation lives in `docs/` and is indexed from `README.md`.
- Keep `docs/validation-helpers.md` in sync with `src/orm/validation.ts`.
- Keep public API examples aligned with the real exports and types.
- Show native Firestore APIs directly when the ORM intentionally does not wrap
  them, such as `FieldValue` sentinels and raw queries.
- After changing documentation, run `pnpm run docs:llms`.
- The MCP server reads `docs/`, `README.md`, and `AGENTS.md` directly. New docs
  are discovered automatically.

## MCP and agent resources

- `llms.txt`: short index for AI agents.
- `llms-full.txt`: concatenated full documentation for large context windows.
- `mcp/server.mjs`: zero-dependency MCP server over stdio.
- `docs/mcp.md`: setup and client configuration.
- Run the server with `pnpm run mcp` or `node mcp/server.mjs`.

## Release flow

1. Update the version in `package.json`.
2. Run `pnpm run typecheck`, `pnpm run test`, `pnpm run build`, and
   `npm pack --dry-run`.
3. Commit and tag with `vX.Y.Z`.
4. Push the commit and tag. The GitHub workflow publishes to npm.
