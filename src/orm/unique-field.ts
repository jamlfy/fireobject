import { field } from './field';
import { fireDataMap } from './state';
import { uniqueMetadata, type UniqueFieldOptions } from './unique-metadata';

/** String fields whose reservations are maintained atomically by FireObject.save. */
export function uniqueField(options: UniqueFieldOptions) {
  return (target: object, propertyKey: string | symbol): void => {
    const key = String(propertyKey);
    const metadata = uniqueMetadata.get(target) ?? new Map();
    metadata.set(key, options);
    uniqueMetadata.set(target, metadata);
    field([
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
