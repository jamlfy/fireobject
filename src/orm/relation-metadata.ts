import type { FireObjectTypeThunk } from './types';

const relationMetadata = new WeakMap<
  object,
  Map<string, FireObjectTypeThunk>
>();

/**
 * Registers a reference-backed relation declared on a model prototype.
 *
 * @param target - Prototype that owns the decorated property.
 * @param key - Relation property name.
 * @param targetType - Model type used to hydrate the relation.
 */
export function setRelationMetadata(
  target: object,
  key: string,
  targetType: FireObjectTypeThunk,
): void {
  const metadata = relationMetadata.get(target) ?? new Map();
  metadata.set(key, targetType);
  relationMetadata.set(target, metadata);
}

/**
 * Returns the merged relation metadata for an instance or prototype.
 *
 * Parent classes are processed first so subclasses can override relations.
 *
 * @param target - Instance or prototype to inspect.
 * @returns Relation names mapped to their target model types.
 */
export function relationMetadataFor(
  target: object,
): Map<string, FireObjectTypeThunk> {
  const prototypes: object[] = [];
  for (
    let current: object | null = target;
    current;
    current = Object.getPrototypeOf(current)
  )
    prototypes.unshift(current);

  const result = new Map<string, FireObjectTypeThunk>();
  for (const prototype of prototypes) {
    const metadata = relationMetadata.get(prototype);
    if (metadata)
      for (const [key, targetType] of metadata)
        result.set(key, targetType);
  }
  return result;
}
