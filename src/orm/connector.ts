import type {
  CollectionGroup,
  CollectionReference,
  DocumentData,
  DocumentSnapshot,
  Firestore,
} from '@google-cloud/firestore';
import type { ConstructorORM } from './types';
import { converter } from './converter';
import { collectionPattern } from './path';
import type { FireObject } from './object';

type ConnectorDecorator = <T extends ConstructorORM<FireObject>>(
  target: T,
  context?: ClassDecoratorContext<T>,
) => T | void;

/**
 * Binds a model class to a Firestore collection.
 *
 * Accepts either a Firestore instance plus a collection pattern
 * (`Users/:user`), or an already-created collection / collection group. The
 * decorator stores the resolved collection and the Firestore instance as static
 * members of the model so `FireObject.collection()` and
 * `FireObject.collectionGroup()` can work without extra configuration.
 *
 * When the pattern contains placeholders, the collection is resolved lazily
 * through `FireObject.collection(params)`.
 *
 * @param db - Firestore instance used by the model.
 * @param pattern - Collection path, optionally with `:param` placeholders.
 * @returns A class decorator that configures the model.
 */
export function Connector(db: Firestore, pattern: string): ConnectorDecorator;
/**
 * Binds a model class to an existing Firestore collection or collection group.
 *
 * The optional `parent` reference is stored as `ParentCollection` and can be
 * used by models that need to know their parent context.
 *
 * @param db - Collection or collection group bound to the model.
 * @param parent - Optional parent collection or collection group.
 * @returns A class decorator that configures the model.
 */
export function Connector(
  db: CollectionReference<DocumentData> | CollectionGroup<DocumentData>,
  parent?: CollectionReference<DocumentData> | CollectionGroup<DocumentData>,
): ConnectorDecorator;
/**
 * Implementation of the `Connector` decorator.
 *
 * @param dbOrCollection - Firestore instance, collection, or collection group.
 * @param patternOrParent - Collection pattern or optional parent collection.
 * @returns A class decorator that configures the model.
 */
export function Connector(
  dbOrCollection:
    | Firestore
    | CollectionReference<DocumentData>
    | CollectionGroup<DocumentData>,
  patternOrParent?:
    string | CollectionReference<DocumentData> | CollectionGroup<DocumentData>,
) {
  /**
   * Configures the decorated model class.
   *
   * @param target - Model constructor.
   * @returns The same constructor, optionally annotated with static members.
   */
  return function decorator<T extends ConstructorORM<FireObject>>(
    target: T,
  ): T | void {
    const pattern =
      typeof patternOrParent === 'string' ? patternOrParent : undefined;
    const resolvedPattern = pattern ? collectionPattern(pattern) : undefined;
    const source = pattern
      ? resolvedPattern?.includes(':')
        ? undefined
        : (dbOrCollection as Firestore).collection(resolvedPattern as string)
      : (dbOrCollection as
          CollectionReference<DocumentData> | CollectionGroup<DocumentData>);

    Object.defineProperty(target, 'CollectionPattern', {
      value: pattern ?? (source && 'path' in source ? source.path : undefined),
      writable: false,
      enumerable: true,
      configurable: false,
    });

    const firestore = pattern
      ? (dbOrCollection as Firestore)
      : (source as { firestore?: Firestore } | undefined)?.firestore;

    if (firestore) {
      Object.defineProperty(target, 'Firestore', {
        value: firestore,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    }

    if (!source) return target;

    const collection = source.withConverter(
      converter(
        target as unknown as new (
          snap: DocumentSnapshot<DocumentData>,
        ) => FireObject,
      ),
    );
    Object.defineProperty(target, 'Collection', {
      value: collection,
      writable: false,
      enumerable: true,
      configurable: false,
    });

    if (patternOrParent && typeof patternOrParent !== 'string') {
      Object.defineProperty(target, 'ParentCollection', {
        value: patternOrParent,
        writable: false,
        enumerable: true,
        configurable: false,
      });
    }
    return target;
  };
}
