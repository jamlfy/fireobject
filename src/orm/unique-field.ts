import { field } from './field';
import { fireDataMap } from './state';
import { uniqueMetadata, type UniqueFieldOptions } from './unique-metadata';

/**
 * Declares a string field whose values are unique inside a reservation
 * collection.
 *
 * The decorator wraps `@field` with required-string validators and records
 * metadata used by `FireObject.save()` to reserve, move, or release values
 * atomically in a Firestore transaction. When `allowOwnerId` is enabled, a
 * value equal to the document id is accepted without normalization.
 *
 * @param options - Validation, normalization, and reservation settings.
 * @returns A property decorator.
 */
export function uniqueField(options: UniqueFieldOptions) {
  return (target: object, propertyKey: string | symbol): void => {
    const key = String(propertyKey);
    const metadata = uniqueMetadata.get(target) ?? new Map();
    metadata.set(key, options);
    uniqueMetadata.set(target, metadata);
    field([
      /**
       * Validates the uniqueness field as a non-empty string and runs the
       * caller-provided validators.
       *
       * @param value - Candidate field value.
       * @param values - Current model values.
       * @returns `true` when valid, otherwise an error message.
       */
      (value, values) => {
        if (typeof value !== 'string' || !value.trim())
          return `${key} must be a non-empty string`;
        if (options.allowOwnerId && value === values?.get('id')) return true;
        for (const validator of options.validators) {
          const result = validator(value, values);
          if (result !== true) return result;
        }
        return true;
      },
    ])(target, propertyKey);
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    const setter = descriptor?.set;
    if (!descriptor || !setter)
      throw new Error(`Missing field setter for ${key}`);
    Object.defineProperty(target, key, {
      ...descriptor,
      /**
       * Normalizes the incoming value before delegating to the field setter.
       *
       * The owner id exception is preserved as-is.
       *
       * @param value - New field value.
       */
      set(this: { id?: string }, value: unknown) {
        const normalized =
          typeof value === 'string' &&
          !(
            options.allowOwnerId &&
            value === (fireDataMap.get(this)?.values.get('id') ?? this.id)
          )
            ? (options.normalize?.(value) ?? value)
            : value;
        setter.call(this, normalized);
      },
    });
  };
}
