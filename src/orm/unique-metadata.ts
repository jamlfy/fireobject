import type { ValidatorFn } from './types';

/** Configuration captured by `@uniqueField`. */
export interface UniqueFieldOptions {
  /** Validators executed by the generated field decorator. */
  validators: ValidatorFn[];
  /** Optional normalization applied before validation and storage. */
  normalize?: (value: string) => string;
  /** Collection used to reserve unique values atomically. */
  reservationCollection: string;
  /** Allows the value to equal the owning document id. */
  allowOwnerId?: boolean;
}

/**
 * Error raised when a field fails validation while saving inside a
 * transaction.
 */
export class FieldValidationError extends Error {
  /**
   * @param field - Field that failed validation.
   * @param message - Validation message.
   */
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'FieldValidationError';
  }
}

/** Error raised when a unique value is already reserved by another document. */
export class UniqueFieldConflictError extends Error {
  /**
   * @param field - Unique field that conflicts.
   */
  constructor(public readonly field: string) {
    super(`${field} is already taken`);
    this.name = 'UniqueFieldConflictError';
  }
}

/** Unique-field metadata keyed by the decorated prototype. */
export const uniqueMetadata = new WeakMap<
  object,
  Map<string, UniqueFieldOptions>
>();

/**
 * Collects unique-field metadata for an instance, respecting inheritance.
 *
 * Subclass fields override fields with the same name in parent prototypes.
 *
 * @param instance - Model instance to inspect.
 * @returns Unique-field configuration keyed by property name.
 */
export function uniqueFields(
  instance: object,
): Map<string, UniqueFieldOptions> {
  const result = new Map<string, UniqueFieldOptions>();
  const overridden = new Set<string>();
  for (
    let prototype = Object.getPrototypeOf(instance);
    prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    for (const [key, options] of uniqueMetadata.get(prototype) ?? []) {
      if (!overridden.has(key)) result.set(key, options);
    }
    for (const key of Object.getOwnPropertyNames(prototype))
      overridden.add(key);
  }
  return result;
}
