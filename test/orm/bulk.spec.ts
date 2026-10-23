import { records } from './helpers/fake-firestore';
import { User, resetUserState } from './helpers/user-model';

beforeEach(resetUserState);

describe('bulk operations', () => {
  it('creates, saves, and deletes several models', async () => {
    const users = await User.createMany([
      { id: 'one', name: 'One' },
      { id: 'two', name: 'Two' },
    ]);
    expect(users).toHaveLength(2);

    users[0]!.name = 'Changed';
    await User.saveMany(users);
    expect(records.get('Users/one')?.['name']).toBe('Changed');

    expect(await User.deleteMany(['one', 'two'], { hard: true })).toBe(2);
    expect(records.has('Users/one')).toBe(false);
    expect(records.has('Users/two')).toBe(false);
  });
});

describe('batch() and transaction()', () => {
  it('exposes Firestore helpers', async () => {
    const ref = User.collection().doc('batch-id');
    await User.batch().set(ref, { name: 'Batched' }).commit();
    expect(records.get('Users/batch-id')?.['name']).toBe('Batched');

    const result = await User.transaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      return snapshot.exists;
    });
    expect(result).toBe(true);
  });
});
