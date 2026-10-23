/**
 * Public ORM entry point.
 *
 * Re-exports the model base class, decorators, validation helpers, errors,
 * query builder, field values, and public types.
 */
export { Connector } from './connector';
export { converter } from './converter';
export { field } from './field';
export { FireObject } from './object';
export { QueryBuilder } from './query';
export { reference } from './reference';
export { fireDataMap } from './state';
export { Subcollection } from './subcollection';
export * as Validation from './validation';
export { uniqueField } from './unique-field';
export {
  ConflictError,
  FieldValidationError,
  FireObjectError,
  NotFoundError,
  QueryError,
  TransactionError,
  UniqueFieldConflictError,
  ValidationError,
} from './errors';
export type { UniqueFieldOptions } from './unique-metadata';
export {
  FieldValue,
  arrayRemove,
  arrayUnion,
  deleteField,
  increment,
  serverTimestamp,
} from './values';
export type {
  BulkCreateOptions,
  BulkDeleteOptions,
  Collection,
  ConstructorORM,
  CreateOptions,
  FieldOptions,
  FireObjectConstructor,
  FireObjectType,
  FireObjectTypeThunk,
  ModelData,
  ModelField,
  MutationOptions,
  Page,
  PaginationOptions,
  SaveOptions,
  SoftDeleteOptions,
  TimestampOptions,
  TransactionOptions,
  ValidatorFn,
} from './types';
