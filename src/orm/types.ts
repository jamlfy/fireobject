import type {
  CollectionGroup,
  CollectionReference,
  DocumentData,
  DocumentSnapshot,
  Query,
} from '@google-cloud/firestore';

import type { FireObject } from './object';

export interface FireObjectConstructor<T extends FireObject> {
  new (snap: DocumentSnapshot<DocumentData> | Record<string, unknown>): T;
  Collection?: CollectionReference<T>;
  CollectionPattern?: string;
  Firestore?: import('@google-cloud/firestore').Firestore;
  ParentCollection?: CollectionReference<T>;
  documentId(value: string): string;
  collection(params?: Record<string, string>): CollectionReference<T>;
  collectionGroup(): CollectionGroup<T>;
  query(...constraints: Array<(query: Query<T>) => Query<T>>): Promise<T[]>;
  queryByPath(
    params: Record<string, string>,
    ...constraints: Array<(query: Query<T>) => Query<T>>
  ): Promise<T[]>;
}

export type ValidatorFn = (
  // ORM validators intentionally accept fields with different runtime types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any,
  values?: Map<string, unknown>,
) => boolean | string;

export type Collection<T = DocumentData> =
  CollectionReference<T> | CollectionGroup<T>;

// Decorators must accept constructors with arbitrary parameter signatures.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConstructorORM<T = object> = abstract new (...args: any[]) => T;
