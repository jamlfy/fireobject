import type { ValidatorFn } from './types';
import { FireObject } from './object';
import { fireDataMap } from './state';
import { normalizeValue } from './normalize-value';

type FireObjectType = new (data: Record<string, unknown>) => FireObject;
type FireObjectTypeThunk = FireObjectType | (() => FireObjectType);

/**
 * Resolves a model constructor that may be provided directly or lazily through
 * a thunk.
 *
 * Lazily resolving the type avoids circular imports between related models.
 *
 * @param type - Model constructor or function returning it.
 * @returns The resolved model constructor.
 */
function resolveType(type: FireObjectTypeThunk): FireObjectType {
  return type.prototype instanceof FireObject
    ? (type as FireObjectType)
    : (type as () => FireObjectType)();
}

/**
 * Declares a model property backed by the ORM state map.
 *
 * The property getter reads from an internal `WeakMap`, so model instances do
 * not need to initialize every field. The setter normalizes incoming values
 * (for example Firestore timestamps to `Date`) and runs the supplied
 * validators, storing the first validation error for `isValid()`.
 *
 * @param validationFn - Validators executed on every assignment.
 * @param subDocType - Optional model type used to hydrate nested objects.
 * @returns A property decorator.
 */
export function field(
  validationFn: ValidatorFn[] = [],
  subDocType?: FireObjectTypeThunk,
) {
  return function (target: object, propertyKey: string | symbol): void {
    const key = String(propertyKey);

    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      /**
       * Reads the stored value and hydrates nested models on demand.
       *
       * @returns The current field value.
       */
      get(this: FireObject): unknown {
        const data = fireDataMap.get(this);
        let value = data?.values.get(key);
        if (
          subDocType &&
          value &&
          typeof value === 'object' &&
          !(value instanceof FireObject)
        ) {
          value = new (resolveType(subDocType))(
            value as Record<string, unknown>,
          );
          data?.values.set(key, value);
        }
        return value;
      },
      /**
       * Normalizes, validates, and stores a new field value.
       *
       * Validation does not throw; the error is recorded and exposed through
       * `getErrors()` / `isValid()`.
       *
       * @param value - New field value.
       */
      set(this: FireObject, value: unknown): void {
        if (!fireDataMap.has(this)) {
          fireDataMap.set(this, { values: new Map(), errors: new Map() });
        }
        const data = fireDataMap.get(this);
        if (!data) throw new Error('FireData not initialized');
        const normalized = normalizeValue(value);

        let errorMessage: string | null = null;
        for (const validator of validationFn) {
          const result = validator(normalized, data.values);
          if (typeof result !== 'boolean' || !result) {
            errorMessage =
              typeof result === 'string' ? result : `Invalid value for ${key}`;
            break;
          }
        }
        data.values.set(key, normalized);
        data.errors.set(key, errorMessage);
      },
    });
  };
}
