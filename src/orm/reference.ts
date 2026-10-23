import {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
} from '@google-cloud/firestore';
import { FireObject } from './object';
import { fireDataMap } from './state';

type ModelType = new (
  data: DocumentSnapshot<DocumentData> | Record<string, unknown>,
) => FireObject;
type ModelTypeThunk = ModelType | (() => ModelType);

function resolveType(type: ModelTypeThunk): ModelType {
  return type.prototype instanceof FireObject
    ? (type as ModelType)
    : (type as () => ModelType)();
}

export function reference(targetType: ModelTypeThunk) {
  return function (target: object, propertyKey: string | symbol): void {
    const key = String(propertyKey);

    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      async get(this: FireObject): Promise<FireObject | FireObject[] | null> {
        const data = fireDataMap.get(this);
        const raw = data?.values.get(key);
        if (!raw) return Array.isArray(raw) ? [] : null;

        const hydrate = async (value: unknown): Promise<unknown> => {
          if (!(value instanceof DocumentReference)) return value;
          const snapshot = await value.get();
          return snapshot.exists
            ? new (resolveType(targetType))(snapshot)
            : null;
        };

        const resolved = Array.isArray(raw)
          ? (await Promise.all(raw.map(hydrate))).filter(Boolean)
          : await hydrate(raw);
        data?.values.set(key, resolved);
        return resolved as FireObject | FireObject[] | null;
      },
      set(this: FireObject, value: unknown): void {
        const data = fireDataMap.get(this);
        if (!data) throw new Error('FireData not initialized');
        const Model = resolveType(targetType);
        const normalize = (item: unknown): unknown =>
          item &&
          typeof item === 'object' &&
          !(item instanceof FireObject) &&
          !(item instanceof DocumentReference)
            ? new Model(item as Record<string, unknown>)
            : item;
        data.values.set(
          key,
          Array.isArray(value) ? value.map(normalize) : normalize(value),
        );
        data.errors.set(key, null);
      },
    });
  };
}
