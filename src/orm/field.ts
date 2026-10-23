import type { ValidatorFn } from './types';
import { FireObject } from './object';
import { fireDataMap } from './state';
import { normalizeValue } from './normalize-value';

type FireObjectType = new (data: Record<string, unknown>) => FireObject;
type FireObjectTypeThunk = FireObjectType | (() => FireObjectType);

function resolveType(type: FireObjectTypeThunk): FireObjectType {
  return type.prototype instanceof FireObject
    ? (type as FireObjectType)
    : (type as () => FireObjectType)();
}

export function field(
  validationFn: ValidatorFn[] = [],
  subDocType?: FireObjectTypeThunk,
) {
  return function (target: object, propertyKey: string | symbol): void {
    const key = String(propertyKey);

    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
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
