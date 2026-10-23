# Field values

`fireobject` does not wrap Firestore sentinels. Import `FieldValue` directly
from `@google-cloud/firestore` and use it in native writes:

```typescript
import { FieldValue } from '@google-cloud/firestore';

await User.collection().doc('alice').update({
  visits: FieldValue.increment(1),
  tags: FieldValue.arrayUnion('beta'),
  updatedAt: FieldValue.serverTimestamp(),
  legacyField: FieldValue.delete(),
});
```

Sentinels pass through `data()` unchanged, so they also work with model saves
and batches:

```typescript
await user.update({
  visits: FieldValue.increment(1),
  tags: FieldValue.arrayUnion('beta'),
});

await User.collection().doc('alice').set(
  { legacyField: FieldValue.delete() },
  { merge: true },
);
```

Firestore resolves these values atomically when the write executes.
