import type {
  Firestore,
  Transaction,
  DocumentReference,
  CollectionReference,
  DocumentData,
} from '@google-cloud/firestore';
import {
  Connector,
  field,
  FireObject,
  uniqueField,
  Validation,
  FieldValidationError,
  UniqueFieldConflictError,
} from '../../src/orm';

const records = new Map<string, Record<string, unknown>>();
let queue: Promise<unknown>;
let autoId = 0;
const time = { isEqual: (other: unknown) => other === time };
const snapshot = (path: string) => ({
  exists: records.has(path),
  data: () => records.get(path),
  updateTime: time,
  ref: reference(path),
});
const reference = (path: string): DocumentReference<DocumentData> =>
  ({
    path,
    id: path.split('/').pop(),
    firestore: database,
    withConverter: () => reference(path),
    get: async () => snapshot(path),
  }) as unknown as DocumentReference<DocumentData>;
const database = {
  collection: (path: string): CollectionReference<DocumentData> =>
    ({
      path,
      firestore: database,
      doc: (id = `generated-${++autoId}`) => reference(`${path}/${id}`),
      withConverter: () => database.collection(path),
    }) as unknown as CollectionReference<DocumentData>,
  runTransaction: (
    callback: (transaction: Transaction) => Promise<unknown>,
  ) => {
    const run = queue.then(async () => {
      const pending = new Map(records);
      let writing = false;
      const write = (
        ref: { path: string },
        value: Record<string, unknown>,
        merge = false,
      ) => {
        writing = true;
        pending.set(ref.path, {
          ...(merge ? pending.get(ref.path) : {}),
          ...value,
        });
      };
      const transaction = {
        get: async (ref: { path: string }) => {
          if (writing) throw new Error('Reads must precede every write');
          return {
            exists: pending.has(ref.path),
            data: () => pending.get(ref.path),
          };
        },
        set: write,
        create: (ref: { path: string }, value: Record<string, unknown>) => {
          if (pending.has(ref.path)) throw new Error('Already exists');
          write(ref, value);
        },
        update: (ref: { path: string }, value: Record<string, unknown>) =>
          write(ref, value, true),
        delete: (ref: { path: string }) => {
          writing = true;
          pending.delete(ref.path);
        },
      };
      const result = await callback(transaction as unknown as Transaction);
      records.clear();
      pending.forEach((value, key) => records.set(key, value));
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  },
};

const config = {
  validators: [
    Validation.isRequired,
    Validation.isString,
    Validation.matches(/^[a-z0-9_-]{3,30}$/, 'Invalid username'),
  ],
  normalize: (value: string) => value.trim().toLowerCase(),
  reservationCollection: 'Usernames',
  allowOwnerId: true,
};
@Connector(database as unknown as Firestore, 'Users/:user')
class Account extends FireObject {
  @field() declare id: string;
  @uniqueField(config) declare username: string;
  @field() declare roles: string[];
  beforeSave() {
    this.username ??= this.id;
  }
}
class InheritedAccount extends Account {}
class MultipleFields extends Account {
  @uniqueField({ ...config, reservationCollection: 'Aliases' })
  declare alias: string;
}

beforeEach(() => {
  records.clear();
  queue = Promise.resolve();
  autoId = 0;
});

it('normalizes and validates strings, with an exact exception for the owner UID', () => {
  expect(new Account({ id: 'one', username: '  New_Name  ' }).username).toBe(
    'new_name',
  );
  for (const username of [
    undefined,
    null,
    42,
    '',
    'ab',
    'a.b',
    'a/b',
    'a'.repeat(31),
  ]) {
    const account = new Account({ id: 'one', username });
    expect(account.getErrors()['username']).toBeTruthy();
  }
  const id = 'FirebaseUID'.repeat(5);
  const account = new Account({ username: id, id });
  expect(account.username).toBe(id);
  expect(account.getErrors()['username']).toBeNull();
  expect(
    new Account({ id: 'other', username: id }).getErrors()['username'],
  ).toBeTruthy();
});

it('rejects invalid values on save without writing anything', async () => {
  const account = new Account({ id: 'one', username: 'a/b' });
  await expect(account.save()).rejects.toBeInstanceOf(FieldValidationError);
  expect(records.size).toBe(0);
});

it('reserves inherited fields, refreshes the snapshot and returns a WriteResult', async () => {
  const account = new InheritedAccount({ id: 'one', username: 'valid' });
  const result = await account.save();
  expect(records.get('Usernames/valid')).toEqual({ uid: 'one' });
  expect(account.exists).toBe(true);
  expect(account.ref?.path).toBe('Users/one');
  expect(result.writeTime).toBe(time);
  expect(result.isEqual(result)).toBe(true);
  expect(account.data()).toEqual({ id: 'one', username: 'valid' });
});

it('allocates a stable owner id before defaults and reservations for a new document', async () => {
  const account = new Account({});
  await account.save();
  expect(account.id).toBe('generated-1');
  expect(account.username).toBe('generated-1');
  expect(records.get('Usernames/generated-1')).toEqual({ uid: 'generated-1' });
});

it('reads the previous name from storage even with a stale instance without a snapshot', async () => {
  records.set('Users/one', { username: 'previous', roles: ['admin'] });
  records.set('Usernames/previous', { uid: 'one' });
  const account = new Account({ id: 'one', username: 'next' });
  await account.save();
  expect(records.has('Usernames/previous')).toBe(false);
  expect(records.get('Usernames/next')).toEqual({ uid: 'one' });
  expect(records.get('Users/one')?.['roles']).toEqual(['admin']);
});

it('repairs a missing reservation even when the name has not changed', async () => {
  records.set('Users/one', { username: 'same' });
  await new Account({ id: 'one', username: 'same' }).save();
  expect(records.get('Usernames/same')).toEqual({ uid: 'one' });
});

it('never deletes an old reservation owned by someone else', async () => {
  records.set('Users/one', { username: 'previous' });
  records.set('Usernames/previous', { uid: 'someone-else' });
  await new Account({ id: 'one', username: 'next' }).save();
  expect(records.get('Usernames/previous')).toEqual({ uid: 'someone-else' });
});

it('rejects conflicting reservations without committing partial changes', async () => {
  records.set('Users/one', { username: 'previous' });
  records.set('Usernames/previous', { uid: 'one' });
  records.set('Usernames/taken', { uid: 'two' });
  const before = new Map(records);
  await expect(
    new Account({ id: 'one', username: 'taken' }).save(),
  ).rejects.toBeInstanceOf(UniqueFieldConflictError);
  expect(records).toEqual(before);
});

it('allows exactly one competing claimant', async () => {
  const results = await Promise.allSettled([
    new Account({ id: 'one', username: 'shared' }).save(),
    new Account({ id: 'two', username: 'shared' }).save(),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(records.get('Usernames/shared')).toEqual({ uid: 'one' });
  expect(records.has('Users/two')).toBe(false);
});

it('reads all reservations before writing, including multiple unique fields', async () => {
  records.set('Users/one', { username: 'previous', alias: 'old-alias' });
  records.set('Usernames/previous', { uid: 'one' });
  records.set('Aliases/old-alias', { uid: 'one' });
  await new MultipleFields({
    id: 'one',
    username: 'next',
    alias: 'new-alias',
  }).save();
  expect(records.get('Aliases/new-alias')).toEqual({ uid: 'one' });
  expect(records.has('Aliases/old-alias')).toBe(false);
});

it('prepares partial writes in an existing transaction without overwriting permissions', async () => {
  records.set('Users/one', { username: 'previous', roles: ['admin'] });
  await database.runTransaction(async (transaction) => {
    const account = new Account({ id: 'one', username: 'next', roles: [] });
    const write = await account.prepareSave(transaction, {
      fields: ['username'],
    });
    await transaction.get(reference('Other/read'));
    write();
  });
  expect(records.get('Users/one')).toEqual({
    username: 'next',
    roles: ['admin'],
  });
});

it('preserves concurrent permissions when saving a username through a partial save', async () => {
  const account = new Account({ id: 'one', username: 'next', roles: [] });
  records.set('Users/one', { username: 'previous', roles: ['admin'] });
  await account.save({ fields: ['username'] });
  expect(records.get('Users/one')).toEqual({
    username: 'next',
    roles: ['admin'],
  });
});

it('preserves and encodes an initial owner UID exactly', async () => {
  const id = 'FirebaseUID'.repeat(5) + '/special';
  await new Account({ username: id, id }).save();
  expect(records.get(`Usernames/${encodeURIComponent(id)}`)).toEqual({
    uid: id,
  });
  expect(records.get(`Users/${encodeURIComponent(id)}`)?.['username']).toBe(id);
});

it('rolls back all fields when a later unique field conflicts', async () => {
  records.set('Aliases/taken', { uid: 'other' });
  const before = new Map(records);
  await expect(
    new MultipleFields({ id: 'one', username: 'valid', alias: 'taken' }).save(),
  ).rejects.toBeInstanceOf(UniqueFieldConflictError);
  expect(records).toEqual(before);
});
