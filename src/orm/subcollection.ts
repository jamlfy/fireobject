import type { FireObjectConstructor } from './types';
import { FireObject } from './object';

export function Subcollection<T extends FireObject>(
  modelClass: FireObjectConstructor<T> | (() => FireObjectConstructor<T>),
  paramKey: string,
  resolveParam: (owner: FireObject) => string = (owner) => owner.id,
) {
  return function (target: object, propertyKey: string | symbol): void {
    Object.defineProperty(target, String(propertyKey), {
      configurable: true,
      enumerable: true,
      async get(this: FireObject): Promise<T[]> {
        const Model =
          'queryByPath' in modelClass
            ? modelClass
            : (modelClass as () => FireObjectConstructor<T>)();
        return Model.queryByPath({ [paramKey]: resolveParam(this) });
      },
      set(): void {
        // Read-only virtual property.
      },
    });
  };
}
