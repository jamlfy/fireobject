import type { ValidatorFn } from './types';

export interface UniqueFieldOptions {
  validators: ValidatorFn[];
  normalize?: (value: string) => string;
  reservationCollection: string;
  allowOwnerId?: boolean;
}

export class FieldValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'FieldValidationError';
  }
}

export class UniqueFieldConflictError extends Error {
  constructor(public readonly field: string) {
    super(`${field} is already taken`);
    this.name = 'UniqueFieldConflictError';
  }
}

export const uniqueMetadata = new WeakMap<
  object,
  Map<string, UniqueFieldOptions>
>();

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
