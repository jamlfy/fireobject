/**
 * Public ORM entry point.
 *
 * Re-exports the model base class, decorators, validation helpers, errors, and
 * public types.
 */
export { Connector } from './connector';
export { converter } from './converter';
export { field } from './field';
export { FireObject } from './object';
export { reference } from './reference';
export { fireDataMap } from './state';
export { Subcollection } from './subcollection';
export * as Validation from './validation';
export { uniqueField } from './unique-field';
export {
  FieldValidationError,
  UniqueFieldConflictError,
  type UniqueFieldOptions,
} from './unique-metadata';
export type {
  Collection,
  ConstructorORM,
  FireObjectConstructor,
  ValidatorFn,
} from './types';
