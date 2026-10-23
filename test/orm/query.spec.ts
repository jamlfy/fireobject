import { User, resetUserState } from './helpers/user-model';

beforeEach(resetUserState);

describe('query builder', () => {
  it('filters, orders, paginates, and counts', async () => {
    for (let index = 0; index < 5; index += 1)
      await User.create({
        id: `user-${index}`,
        name: `User ${index}`,
        active: index % 2 === 0,
      });

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
});
