import type {
  CollectionGroup,
  CollectionReference,
  DocumentData,
  DocumentSnapshot,
  FieldPath,
  Filter,
  Firestore,
  OrderByDirection,
  Query,
  WhereFilterOp,
  WriteBatch,
} from '@google-cloud/firestore';

import type { FireObject } from './object';

/** Data type carried by a `FireObject`. */
export type ModelData<T> =
  T extends FireObject<infer Data> ? Data : Record<string, unknown>;

/** String field names accepted by a model. */
export type ModelField<T> = Extract<keyof ModelData<T>, string>;

/** Model constructor accepted by field and relation decorators. */
export type FireObjectType = new (
  data: DocumentSnapshot<DocumentData> | Record<string, unknown>,
) => FireObject<any>;

/** Model constructor or a thunk resolving one lazily. */
export type FireObjectTypeThunk = FireObjectType | (() => FireObjectType);

/**
 * Static surface required by a `FireObject` model constructor.
 *
 * `@Connector` fills most of these members at runtime. Implementations can
 * declare them to get richer typing in static helpers.
 */
export interface FireObjectConstructor<
  T extends FireObject<any> = FireObject<any>,
> {
  /** Creates a model from a snapshot or plain data object. */
  new (snap: DocumentSnapshot<DocumentData> | Record<string, unknown>): T;
  /** Collection bound by `@Connector` when the path has no placeholders. */
  Collection?: CollectionReference<T>;
  /** Collection pattern declared by `@Connector`. */
  CollectionPattern?: string;
  /** Firestore instance associated with the model. */
  Firestore?: Firestore;
  /** Optional parent collection/group supplied to `@Connector`. */
  ParentCollection?: CollectionReference<T>;
  /** Enables automatic `createdAt` / `updatedAt` fields. */
  timestamps?: boolean | TimestampOptions;
  /** Enables soft deletes instead of permanently deleting documents. */
  softDelete?: boolean | SoftDeleteOptions;
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
  /** Finds a document by id. */
  find(id: string, params?: Record<string, string>): Promise<T | null>;
  /** Finds several documents by id. */
  findMany(
    ids: ReadonlyArray<string>,
    params?: Record<string, string>,
  ): Promise<T[]>;
  /** Finds a document by id or throws `NotFoundError`. */
  findOrFail(id: string, params?: Record<string, string>): Promise<T>;
  /** Returns every document in the collection. */
  all(params?: Record<string, string>): Promise<T[]>;
  /** Loads and caches reference-backed relations for several models. */
  populate(models: ReadonlyArray<T>, ...fields: string[]): Promise<T[]>;
  /** Creates and persists a model. */
  create(
    data: Partial<ModelData<T>>,
    options?: string | CreateOptions,
  ): Promise<T>;
  /** Updates an existing model. */
  update(
    id: string,
    data: Partial<ModelData<T>>,
    options?: MutationOptions,
  ): Promise<T>;
  /** Creates a model or replaces an existing one. */
  upsert(
    data: Partial<ModelData<T>>,
    options?: string | CreateOptions,
  ): Promise<T>;
  /** Soft deletes (when enabled) or permanently deletes a document. */
  delete(
    id: string,
    options?: MutationOptions & { hard?: boolean },
  ): Promise<boolean>;
  /** Counts documents in the collection. */
  count(params?: Record<string, string>): Promise<number>;
  /** Checks whether a document exists. */
  exists(id: string, params?: Record<string, string>): Promise<boolean>;
  /** Starts a typed query builder from a composed filter. */
  where(filter: Filter): import('./query').QueryBuilder<T>;
  /** Starts a typed query builder from a field filter. */
  where<K extends ModelField<T>>(
    field: K | FieldPath,
    operator: WhereFilterOp,
    value: unknown,
  ): import('./query').QueryBuilder<T>;
  /** Orders a static query. */
  orderBy<K extends ModelField<T>>(
    field: K | FieldPath,
    direction?: OrderByDirection,
  ): import('./query').QueryBuilder<T>;
  /** Limits the number of documents returned by static queries. */
  limit(limit: number): import('./query').QueryBuilder<T>;
  /** Persists several models. */
  saveMany(
    models: ReadonlyArray<FireObject<any>>,
    options?: SaveOptions,
  ): Promise<void>;
  /** Creates several models from plain data. */
  createMany(
    records: ReadonlyArray<Partial<ModelData<T>>>,
    options?: BulkCreateOptions,
  ): Promise<T[]>;
  /** Deletes several documents by id. */
  deleteMany(
    ids: ReadonlyArray<string>,
    options?: BulkDeleteOptions,
  ): Promise<number>;
  /** Creates a Firestore write batch. */
  batch(): WriteBatch;
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

/** Options accepted by `@field`. */
export interface FieldOptions {
  /** Validators executed on every assignment. */
  validators?: ValidatorFn[];
  /** Optional model type used to hydrate nested objects. */
  subDocType?: FireObjectTypeThunk;
  /** Default value applied when a new model is created without the field. */
  default?: unknown | (() => unknown);
  /** Converts the in-memory value into a Firestore-safe value. */
  serialize?: (value: unknown, values: Map<string, unknown>) => unknown;
  /** Converts a value loaded from Firestore into the in-memory value. */
  deserialize?: (value: unknown, values: Map<string, unknown>) => unknown;
  /** When `false`, rejects `null` and `undefined`. Defaults to `true`. */
  nullable?: boolean;
  /** Rejects changes after the document has been persisted. */
  immutable?: boolean;
}

/** Automatic timestamp field configuration. */
export interface TimestampOptions {
  /** Field updated only on creation. Defaults to `createdAt`. */
  createdAt?: string;
  /** Field updated on every save. Defaults to `updatedAt`. */
  updatedAt?: string;
}

/** Soft-delete field configuration. */
export interface SoftDeleteOptions {
  /** Field used to mark a document as deleted. Defaults to `deletedAt`. */
  field?: string;
  /** Value assigned on delete. Defaults to the current `Date`. */
  value?: unknown;
}

/** Options for creating a model. */
export interface CreateOptions {
  /** Explicit document id. */
  id?: string;
  /** Values for collection path placeholders. */
  params?: Record<string, string>;
}

/** Options for updating or deleting an existing model. */
export interface MutationOptions {
  /** Values for collection path placeholders. */
  params?: Record<string, string>;
}

/** Options for partial saves. */
export interface SaveOptions {
  /** Only write these fields. */
  fields?: readonly string[];
  /** Requires the document to be created and fails if it already exists. */
  create?: boolean;
}

/** Options for `createMany`. */
export interface BulkCreateOptions {
  /** Values for collection path placeholders shared by every record. */
  params?: Record<string, string>;
}

/** Options for `deleteMany`. */
export interface BulkDeleteOptions extends MutationOptions {
  /** Permanently delete instead of using soft delete. */
  hard?: boolean;
}

/** Pagination options accepted by `QueryBuilder.paginate`. */
export interface PaginationOptions {
  /** Page size. Defaults to 20. */
  limit?: number;
  /** Cursor returned by a previous `paginate` call. */
  startAfter?: unknown;
}

/** Result returned by `QueryBuilder.paginate`. */
export interface Page<T> {
  /** Documents in this page. */
  items: T[];
  /** Snapshot to pass as `startAfter` for the next page. */
  nextCursor?: DocumentSnapshot<T>;
  /** Whether another page is available. */
  hasMore: boolean;
}

/** Options for the transaction retry helper. */
export interface TransactionOptions {
  /** Maximum number of attempts made by Firestore. */
  maxAttempts?: number;
  /** Runs the transaction in read-only mode. */
  readOnly?: boolean;
}

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
