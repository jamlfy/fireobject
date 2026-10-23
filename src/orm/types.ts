import type {
  CollectionGroup,
  CollectionReference,
  DocumentData,
  DocumentSnapshot,
  Query,
} from '@google-cloud/firestore';

import type { FireObject } from './object';

/**
 * Static surface required by a `FireObject` model constructor.
 *
 * `@Connector` fills most of these members at runtime. Implementations can
 * declare them to get richer typing in static helpers.
 */
export interface FireObjectConstructor<T extends FireObject> {
  /** Creates a model from a snapshot or plain data object. */
  new (snap: DocumentSnapshot<DocumentData> | Record<string, unknown>): T;
  /** Collection bound by `@Connector` when the path has no placeholders. */
  Collection?: CollectionReference<T>;
  /** Collection pattern declared by `@Connector`. */
  CollectionPattern?: string;
  /** Firestore instance associated with the model. */
  Firestore?: import('@google-cloud/firestore').Firestore;
  /** Optional parent collection/group supplied to `@Connector`. */
  ParentCollection?: CollectionReference<T>;
  /** Encodes a value into a Firestore-safe document id. */
  documentId(value: string): string;
  /** Returns the model collection, filling pattern params when needed. */
  collection(params?: Record<string, string>): CollectionReference<T>;
  /** Returns a collection-group reference for the model. */
  collectionGroup(): CollectionGroup<T>;
  /** Runs a query with composable constraints. */
  query(...constraints: Array<(query: Query<T>) => Query<T>>): Promise<T[]>;
  /** Runs a query against a parameterized collection path. */
  queryByPath(
    params: Record<string, string>,
    ...constraints: Array<(query: Query<T>) => Query<T>>
  ): Promise<T[]>;
}

/**
 * Field validator used by `@field`.
 *
 * Receives the normalized value and the current values map. Returning `true`
 * means valid; returning `false` or a string marks the field invalid. A string
 * is used as the error message.
 */
export type ValidatorFn = (
  // ORM validators intentionally accept fields with different runtime types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any,
  values?: Map<string, unknown>,
) => boolean | string;

/** Firestore collection or collection-group reference. */
export type Collection<T = DocumentData> =
  CollectionReference<T> | CollectionGroup<T>;

/**
 * Constructor accepted by class decorators.
 *
 * Decorators must accept constructors with arbitrary parameter signatures.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConstructorORM<T = object> = abstract new (...args: any[]) => T;
