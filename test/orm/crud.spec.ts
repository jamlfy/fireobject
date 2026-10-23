import { ConflictError, NotFoundError } from '../../src/orm';
import { records } from './helpers/fake-firestore';
import { hooks, User, resetUserState } from './helpers/user-model';

beforeEach(resetUserState);

describe('create()', () => {
  it('does not overwrite existing documents', async () => {
    await User.create({ id: 'alice', name: 'Alice' });

    await expect(
      User.create({ id: 'alice', name: 'Changed' }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(records.get('Users/alice')?.['name']).toBe('Alice');
  });
});

describe('find(), update(), and upsert()', () => {
  it('finds, lists, counts, updates, and upserts', async () => {
    await User.create({ id: 'a', name: 'A', active: true });
    await User.create({ id: 'b', name: 'B', active: false });

    expect((await User.find('a'))?.name).toBe('A');
    expect(await User.find('missing')).toBeNull();
    await expect(User.findOrFail('missing')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await User.exists('a')).toBe(true);
    expect(await User.count()).toBe(2);
    expect(await User.all()).toHaveLength(2);

    const updated = await User.update('a', { name: 'Updated' });
    expect(updated.name).toBe('Updated');
    expect(records.get('Users/a')?.['name']).toBe('Updated');

    await User.upsert({ id: 'c', name: 'C' });
    expect(records.has('Users/c')).toBe(true);
    const existing = await User.upsert({ id: 'a', name: 'Again' });
    expect(existing.name).toBe('Again');
  });
});

describe('delete()', () => {
  it('supports soft delete, restore, and hard delete', async () => {
    await User.create({ id: 'alice', name: 'Alice' });
    hooks.length = 0;

    expect(await User.delete('alice')).toBe(true);
    expect(records.get('Users/alice')?.['deletedAt']).toBeInstanceOf(Date);
    expect(hooks).toEqual(['beforeDelete', 'afterDelete']);

    const deleted = await User.findOrFail('alice');
    await deleted.restore();
    expect(records.get('Users/alice')).not.toHaveProperty('deletedAt');

    expect(await User.delete('alice', { hard: true })).toBe(true);
    expect(records.has('Users/alice')).toBe(false);
    expect(await User.delete('missing')).toBe(false);
  });
});
