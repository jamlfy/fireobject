import { FieldValue as FirestoreFieldValue } from '@google-cloud/firestore';
import {
  FieldValidationError,
  FieldValue,
  FireObjectError,
  NotFoundError,
  ValidationError,
  increment,
  serverTimestamp,
} from '../../src/orm';

describe('field values', () => {
  it('re-exports Firestore sentinels', () => {
    expect(serverTimestamp()).toBeInstanceOf(FirestoreFieldValue);
    expect(increment(2)).toBeInstanceOf(FirestoreFieldValue);
    expect(FieldValue.arrayUnion('a')).toBeInstanceOf(FirestoreFieldValue);
    expect(FieldValue.arrayRemove('a')).toBeInstanceOf(FirestoreFieldValue);
    expect(FieldValue.deleteField()).toBeInstanceOf(FirestoreFieldValue);
  });
});

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
