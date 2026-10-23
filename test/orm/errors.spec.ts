import {
  FieldValidationError,
  FireObjectError,
  NotFoundError,
  ValidationError,
} from '../../src/orm';

describe('errors', () => {
  it('uses a consistent error hierarchy', () => {
    const error = new FieldValidationError('name', 'required');
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toBeInstanceOf(FireObjectError);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.errors).toEqual({ name: 'required' });
    expect(new NotFoundError('Users', 'missing').code).toBe('NOT_FOUND');
  });
});
