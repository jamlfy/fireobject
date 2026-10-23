import {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
} from '@google-cloud/firestore';
import { FireObject } from './object';
import { fireDataMap } from './state';
import { setRelationMetadata } from './relation-metadata';
import { isDocumentReference } from './is-document-reference';

type ModelType = new (
  data: DocumentSnapshot<DocumentData> | Record<string, unknown>,
) => FireObject;
type ModelTypeThunk = ModelType | (() => ModelType);

/**
 * Resolves a model constructor that may be provided directly or lazily through
 * a thunk.
 *
 * @param type - Model constructor or function returning it.
 * @returns The resolved model constructor.
 */
function resolveType(type: ModelTypeThunk): ModelType {
  return type.prototype instanceof FireObject
    ? (type as ModelType)
    : (type as () => ModelType)();
}

/**
 * Declares a relation backed by Firestore `DocumentReference` values.
 *
 * Reading the property hydrates references into model instances (or arrays of
 * instances). Assigning a model, a plain object, or a document reference stores
 * the value and exposes it through `data()`. `null` is returned when a single
 * referenced document no longer exists.
 *
 * @param targetType - Model type used to hydrate referenced documents.
 * @returns A property decorator.
 */
export function reference(targetType: ModelTypeThunk) {
  return function (target: object, propertyKey: string | symbol): void {
    const key = String(propertyKey);
    setRelationMetadata(target, key, targetType);

    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      /**
       * Resolves stored references into model instances.
       *
       * @returns The hydrated model, an array of models, or `null`.
       */
      async get(this: FireObject): Promise<FireObject | FireObject[] | null> {
        const data = fireDataMap.get(this);
        const raw = data?.values.get(key);
        if (!raw) return Array.isArray(raw) ? [] : null;

        const hydrate = async (value: unknown): Promise<unknown> => {
          if (!isDocumentReference(value)) return value;
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
      /**
       * Normalizes plain objects into model instances while preserving
       * document references and existing model instances.
       *
       * @param value - New relation value.
       */
      set(this: FireObject, value: unknown): void {
        const data = fireDataMap.get(this);
        if (!data) throw new Error('FireData not initialized');
        const Model = resolveType(targetType);
        const normalize = (item: unknown): unknown =>
          item &&
          typeof item === 'object' &&
          !(item instanceof FireObject) &&
          !isDocumentReference(item)
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
