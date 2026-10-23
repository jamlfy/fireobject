import type { FieldOptions, ValidatorFn } from './types';

/** Field metadata keyed by the decorated prototype. */
export const fieldMetadata = new WeakMap<object, Map<string, FieldOptions>>();

/**
 * Builds the effective validator list for a field.
 *
 * The implicit nullability validator runs before user validators.
 *
 * @param key - Field name.
 * @param options - Field configuration.
 * @returns Validators in execution order.
 */
export function fieldValidators(
  key: string,
  options: FieldOptions,
): ValidatorFn[] {
  const validators = [...(options.validators ?? [])];
  if (options.nullable === false) {
    validators.unshift((value: unknown) =>
      value !== null && value !== undefined
        ? true
        : `Field ${key} cannot be null or undefined`,
    );
  }
  return validators;
}

/**
 * Collects field metadata for an instance, respecting inheritance.
 *
 * Subclass fields override fields with the same name in parent prototypes.
 *
 * @param instance - Model instance to inspect.
 * @returns Field options keyed by property name.
 */
export function fieldOptions(instance: object): Map<string, FieldOptions> {
  const result = new Map<string, FieldOptions>();
  const overridden = new Set<string>();
  for (
    let prototype = Object.getPrototypeOf(instance);
    prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    for (const [key, options] of fieldMetadata.get(prototype) ?? []) {
      if (!overridden.has(key)) result.set(key, options);
    }
    for (const key of Object.getOwnPropertyNames(prototype))
      overridden.add(key);
  }
  return result;
}
