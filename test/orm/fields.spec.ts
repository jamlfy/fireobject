import { FieldValidationError } from '../../src/orm';
import { records } from './helpers/fake-firestore';
import { hooks, User, resetUserState } from './helpers/user-model';

beforeEach(resetUserState);

describe('field options', () => {
  it('applies defaults, field converters, nullable validation, and timestamps', async () => {
    const user = await User.create(
      { id: 'alice', name: 'Alice', secret: 'token' },
      { id: 'alice' },
    );

    expect(user.role).toBe('member');
    expect(user.secret).toBe('token');
    expect(records.get('Users/alice')?.['secret']).toBe('serialized:token');
    expect(records.get('Users/alice')?.['role']).toBe('member');
    expect(records.get('Users/alice')?.['createdAt']).toBeInstanceOf(Date);
    expect(records.get('Users/alice')?.['updatedAt']).toBeInstanceOf(Date);
    expect(hooks).toEqual([
      'beforeSave',
      'beforeCreate',
      'afterCreate',
      'afterSave',
    ]);

    expect((await User.find('alice'))?.secret).toBe('token');

    await expect(User.create({ id: 'bob' } as never)).rejects.toBeInstanceOf(
      FieldValidationError,
    );
  });

  it('enforces immutable fields on update', async () => {
    await User.create({ id: 'alice', name: 'Alice', email: 'a@example.com' });

    await expect(
      User.update('alice', { email: 'other@example.com' }),
    ).rejects.toBeInstanceOf(FieldValidationError);
    expect(records.get('Users/alice')?.['email']).toBe('a@example.com');
  });
});
