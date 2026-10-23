import type { FireObjectConstructor } from './types';
import { FireObject } from './object';

/**
 * Declares a read-only virtual property that loads a subcollection.
 *
 * The getter calls `queryByPath` on the related model using a path parameter
 * derived from the owner instance. By default the parameter is the owner `id`;
 * pass a custom `paramKey`/`resolveParam` for other patterns.
 *
 * @param modelClass - Related model constructor or a thunk returning it.
 * @param paramKey - Pattern placeholder that identifies the parent document.
 * @param resolveParam - Function that extracts the parent value from the owner.
 * @returns A property decorator.
 */
export function Subcollection<T extends FireObject>(
  modelClass: FireObjectConstructor<T> | (() => FireObjectConstructor<T>),
  paramKey: string,
  resolveParam: (owner: FireObject) => string = (owner) => owner.id,
) {
  return function (target: object, propertyKey: string | symbol): void {
    Object.defineProperty(target, String(propertyKey), {
      configurable: true,
      enumerable: true,
      /**
       * Loads related documents from the subcollection.
       *
       * @returns A promise resolving to the related model instances.
       */
      async get(this: FireObject): Promise<T[]> {
        const Model =
          'queryByPath' in modelClass
            ? modelClass
            : (modelClass as () => FireObjectConstructor<T>)();
        return Model.queryByPath({ [paramKey]: resolveParam(this) });
      },
      /**
       * Subcollections are virtual and cannot be assigned directly.
       */
      set(): void {
        // Read-only virtual property.
      },
    });
  };
}
