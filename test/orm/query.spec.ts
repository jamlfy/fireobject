import { Filter } from '../../src/orm';
import { User, resetUserState } from './helpers/user-model';

beforeEach(resetUserState);

const createUsers = async (total: number): Promise<void> => {
  for (let index = 0; index < total; index += 1)
    await User.create({
      id: `user-${index}`,
      name: `User ${index}`,
      active: index % 2 === 0,
    });
};

describe('query builder', () => {
  it('filters, orders, paginates, and counts', async () => {
    await createUsers(5);

    expect(await User.where('active', '==', true).get()).toHaveLength(3);
    expect(await User.where('active', '==', true).count()).toBe(3);

    const ordered = await User.orderBy('name', 'desc').limit(2).get();
    expect(ordered.map((user) => user.id)).toEqual(['user-4', 'user-3']);

    const firstPage = await User.orderBy('name').paginate(2);
    expect(firstPage.items.map((user) => user.id)).toEqual([
      'user-0',
      'user-1',
    ]);
    expect(firstPage.hasMore).toBe(true);

    const secondPage = await User.orderBy('name').paginate({
      limit: 2,
      startAfter: firstPage.nextCursor,
    });
    expect(secondPage.items.map((user) => user.id)).toEqual([
      'user-2',
      'user-3',
    ]);
  });

  it('supports composed Filter queries', async () => {
    await createUsers(5);

    const any = await User.where(
      Filter.or(
        Filter.where('active', '==', true),
        Filter.where('name', '==', 'User 3'),
      ),
    ).get();
    expect(any.map((user) => user.id)).toEqual([
      'user-0',
      'user-2',
      'user-3',
      'user-4',
    ]);

    const all = await User.where(
      Filter.and(
        Filter.where('active', '==', true),
        Filter.where('name', '==', 'User 0'),
      ),
    ).get();
    expect(all.map((user) => user.id)).toEqual(['user-0']);
  });

  it('checks whether a query has results', async () => {
    await createUsers(5);

    await expect(User.where('active', '==', true).exists()).resolves.toBe(
      true,
    );
    await expect(User.where('name', '==', 'Missing').exists()).resolves.toBe(
      false,
    );
  });
});

describe('findMany()', () => {
  it('fetches ids in chunks while preserving input order', async () => {
    await createUsers(35);

    const ids = Array.from({ length: 35 }, (_, index) => `user-${index}`);
    const users = await User.findMany(ids);
    expect(users.map((user) => user.id)).toEqual(ids);
  });

  it('omits missing ids and deduplicates input', async () => {
    await createUsers(3);

    const users = await User.findMany([
      'user-2',
      'missing',
      'user-0',
      'user-2',
    ]);
    expect(users.map((user) => user.id)).toEqual(['user-2', 'user-0']);
  });

  it('returns an empty array for empty input', async () => {
    await expect(User.findMany([])).resolves.toEqual([]);
  });
});
