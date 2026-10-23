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

export function Connector(db: Firestore, pattern: string): ConnectorDecorator;
export function Connector(
  db: CollectionReference<DocumentData> | CollectionGroup<DocumentData>,
  parent?: CollectionReference<DocumentData> | CollectionGroup<DocumentData>,
): ConnectorDecorator;
export function Connector(
  dbOrCollection:
    | Firestore
    | CollectionReference<DocumentData>
    | CollectionGroup<DocumentData>,
  patternOrParent?:
    string | CollectionReference<DocumentData> | CollectionGroup<DocumentData>,
) {
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

    if (pattern) {
      Object.defineProperty(target, 'Firestore', {
        value: dbOrCollection,
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
