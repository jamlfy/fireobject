# Troubleshooting

## `Firestore instance not configured`

The model was not decorated with `@Connector(db, ...)`, or the decorator
received a collection without an accessible `firestore` property.

Use:

```typescript
@Connector(db, 'Users/:user')
```

## `Missing param "..." for path "..."`

A parameterized collection was used without providing all placeholders:

```typescript
User.collection({ user: 'alice' });
```

Pass every placeholder, or use `queryByPath` / a model instance that has the
required properties.

## Fields are not validated

Check that the model property uses `@field` and that your `tsconfig.json` has
`experimentalDecorators: true` and `useDefineForClassFields: false`.

## `UniqueFieldConflictError`

Another document already owns the reservation. Inspect the reservation
collection (`Usernames/{value}` in the examples) and the stored document.

## Type errors in consumer projects

Make sure there is only one copy of `@google-cloud/firestore`. Because it is a
peer dependency, use your package manager's deduplication or overrides if
needed.
