import {
  CollectionGroup,
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  FieldPath,
  FieldValue as FirestoreFieldValue,
  Firestore,
  FirestoreDataConverter,
  OrderByDirection,
  Query,
  Timestamp,
  Transaction,
  WhereFilterOp,
  WithFieldValue,
  WriteBatch,
  WriteResult,
} from '@google-cloud/firestore';
import type {
  BulkCreateOptions,
  BulkDeleteOptions,
  CreateOptions,
  FireObjectConstructor,
  ModelData,
  ModelField,
  MutationOptions,
  SaveOptions,
  SoftDeleteOptions,
  TimestampOptions,
  TransactionOptions,
} from './types';
import { converter } from './converter';
import { toDate } from './date';
import { fireDataMap } from './state';
import { fieldOptions, fieldValidators } from './field-metadata';
import { normalizeValue } from './normalize-value';
import {
  ConflictError,
  FieldValidationError,
  NotFoundError,
  QueryError,
  UniqueFieldConflictError,
} from './errors';
import { uniqueFields } from './unique-metadata';
import {
  collectionPattern,
  fillCollectionPattern,
  instancePathParams,
} from './path';
import { QueryBuilder } from './query';

/** Minimal constructor type used to infer the concrete model type. */
type ModelConstructor<T extends FireObject<any>> = new (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => T;

/**
 * Narrows a static model constructor to the full ORM constructor surface.
 *
 * @param value - Model constructor.
 * @returns The same constructor with ORM static members.
 */
function modelConstructor<T extends FireObject<any>>(
  value: ModelConstructor<T>,
): FireObjectConstructor<T> {
  return value as unknown as FireObjectConstructor<T>;
}

/** Error used consistently when a model has no Firestore binding. */
const FIRESTORE_NOT_CONFIGURED =
  'Firestore instance not configured. Use @Connector(db, pattern) to bind a database to the model.';

/**
 * Checks whether a property in the prototype chain has an accessor setter.
 *
 * @param target - Instance to inspect.
 * @param key - Property name.
 * @returns The setter when one exists.
 */
function propertySetter(
  target: object,
  key: string,
): ((this: unknown, value: unknown) => void) | undefined {
  for (
    let prototype = target;
    prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    if (descriptor) return descriptor.set;
  }
  return undefined;
}

/**
 * Compares two persisted values, including dates and timestamp-shaped values.
 *
 * @param left - First value.
 * @param right - Second value.
 * @returns `true` when both values represent the same data.
 */
function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  const leftDate = toDate(left);
  const rightDate = toDate(right);
  if (leftDate && rightDate) return leftDate.getTime() === rightDate.getTime();
  if (
    left &&
    right &&
    typeof left === 'object' &&
    typeof right === 'object'
  ) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Normalizes options accepted by `create` and `upsert`.
 *
 * @param options - String id or full create options.
 * @returns Normalized create options.
 */
function createOptions(
  options: string | CreateOptions | undefined,
): CreateOptions {
  return typeof options === 'string' ? { id: options } : (options ?? {});
}

/**
 * Detects Firestore's already-exists error across SDK error shapes.
 *
 * @param error - Error raised by a create/write operation.
 * @returns `true` when the document already exists.
 */
function isAlreadyExists(error: unknown): boolean {
  const value = error as { code?: unknown; message?: unknown };
  return (
    value?.code === 6 ||
    value?.code === '6' ||
    value?.code === 'already-exists' ||
    /ALREADY_EXISTS|already exists/i.test(String(value?.message ?? error))
  );
}

/**
 * Base class for Firestore models.
 *
 * Models extend this class and declare fields with `@field`. The base class
 * provides persistence helpers, static CRUD helpers, a query builder, hooks,
 * validation state, timestamps, soft deletes, and snapshot access.
 *
 * Instances can be created from a Firestore snapshot or from a plain object.
 * Field values are kept in an internal `WeakMap` and exposed through decorated
 * accessors.
 */
export abstract class FireObject<
  TData extends object = Record<string, unknown>,
> {
  #snapshot?: DocumentSnapshot<DocumentData>;

  /** Enables automatic `createdAt` / `updatedAt` fields when set to `true`. */
  static timestamps: boolean | TimestampOptions = false;

  /** Enables soft deletes when set to `true`. */
  static softDelete: boolean | SoftDeleteOptions = false;

  /**
   * Encodes a value so it can safely be used as a Firestore document id.
   *
   * Firestore document ids cannot contain `/` and may need encoding for
   * arbitrary strings such as package names (`@scope/name`).
   *
   * @param value - Raw document id.
   * @returns URL-encoded document id.
   */
  static documentId(value: string): string {
    return encodeURIComponent(value);
  }

  /**
   * Returns the collection associated to the model.
   *
   * When the model was decorated with a parameterized pattern, the required
   * path params must be supplied. The returned reference is already bound to
   * the model converter, so queries return model instances instead of plain
   * objects.
   *
   * @param params - Values for the placeholders in the collection pattern.
   * @returns Firestore collection reference bound to the model converter.
   * @throws If no collection pattern/collection is configured or a path param
   * is missing.
   */
  static collection<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    params: Record<string, string> = {},
  ): CollectionReference<T> {
    const Model = modelConstructor(this);
    if (Model.Collection?.path) return Model.Collection;
    if (!Model.CollectionPattern)
      throw new Error('Collection pattern not found');
    if (!Model.Firestore) throw new Error(FIRESTORE_NOT_CONFIGURED);

    return Model.Firestore.collection(
      fillCollectionPattern(Model.CollectionPattern, params),
    ).withConverter(
      converter(
        this as unknown as new (snap: DocumentSnapshot<DocumentData>) => T,
      ) as unknown as FirestoreDataConverter<T>,
    );
  }

  /**
   * Returns a collection-group query for the model.
   *
   * The collection-group name is taken from the last collection segment of the
   * model pattern. This allows querying documents with the same collection name
   * across different parent paths.
   *
   * @returns Firestore collection-group reference bound to the model converter.
   * @throws If the model has no valid collection pattern or no Firestore
   * instance is bound.
   */
  static collectionGroup<T extends FireObject<any>>(
    this: ModelConstructor<T>,
  ): CollectionGroup<T> {
    const Model = modelConstructor(this);
    if (!Model.CollectionPattern)
      throw new Error('Collection pattern not found');
    if (!Model.Firestore) throw new Error(FIRESTORE_NOT_CONFIGURED);
    const segments = collectionPattern(Model.CollectionPattern).split('/');
    const name = segments[segments.length - 1];
    if (!name || name.startsWith(':')) {
      throw new Error(`Invalid collection pattern: ${Model.CollectionPattern}`);
    }
    return Model.Firestore.collectionGroup(name).withConverter(
      converter(
        this as unknown as new (snap: DocumentSnapshot<DocumentData>) => T,
      ) as unknown as FirestoreDataConverter<T>,
    );
  }

  /**
   * Runs a collection query with composable constraints.
   *
   * @param constraints - Functions that receive and return a Firestore query.
   * @returns A promise resolving to the matching model instances.
   */
  static async query<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    ...constraints: Array<(query: Query<T>) => Query<T>>
  ): Promise<T[]> {
    const Model = modelConstructor(this);
    let query: Query<T> = Model.collection();
    for (const constraint of constraints) query = constraint(query);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data());
  }

  /**
   * Runs a collection query against a parameterized path.
   *
   * @param params - Values for the placeholders in the collection pattern.
   * @param constraints - Functions that receive and return a Firestore query.
   * @returns A promise resolving to the matching model instances.
   */
  static async queryByPath<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    params: Record<string, string>,
    ...constraints: Array<(query: Query<T>) => Query<T>>
  ): Promise<T[]> {
    const Model = modelConstructor(this);
    let query: Query<T> = Model.collection(params);
    for (const constraint of constraints) query = constraint(query);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data());
  }

  /**
   * Starts a typed query builder for the model collection.
   *
   * @returns A new query builder.
   */
  static where<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    field: ModelField<T> | FieldPath,
    operator: WhereFilterOp,
    value: unknown,
  ): QueryBuilder<T> {
    const Model = modelConstructor(this);
    return new QueryBuilder(Model.collection()).where(field, operator, value);
  }

  /**
   * Starts a typed query builder with an ordering clause.
   *
   * @param field - Model field or Firestore field path.
   * @param direction - Sort direction.
   * @returns A new query builder.
   */
  static orderBy<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    field: ModelField<T> | FieldPath,
    direction: OrderByDirection = 'asc',
  ): QueryBuilder<T> {
    const Model = modelConstructor(this);
    return new QueryBuilder(Model.collection()).orderBy(field, direction);
  }

  /**
   * Starts a typed query builder with a limit.
   *
   * @param limit - Maximum number of documents.
   * @returns A new query builder.
   */
  static limit<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    limit: number,
  ): QueryBuilder<T> {
    const Model = modelConstructor(this);
    return new QueryBuilder(Model.collection()).limit(limit);
  }

  /**
   * Finds a document by id.
   *
   * @param id - Document id.
   * @param params - Values for non-document path placeholders.
   * @returns The model, or `null` when the document does not exist.
   */
  static async find<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    id: string,
    params: Record<string, string> = {},
  ): Promise<T | null> {
    const Model = modelConstructor(this);
    const snapshot = await Model.collection(params)
      .doc(Model.documentId(id))
      .get();
    return snapshot.exists ? (snapshot.data() ?? null) : null;
  }

  /**
   * Finds a document by id or throws `NotFoundError`.
   *
   * @param id - Document id.
   * @param params - Values for non-document path placeholders.
   * @returns The matching model.
   * @throws `NotFoundError` when the document does not exist.
   */
  static async findOrFail<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    id: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const Model = modelConstructor(this);
    const model = await Model.find(id, params);
    if (model) return model;
    throw new NotFoundError(Model.collection(params).path, id);
  }

  /**
   * Returns every document in the collection.
   *
   * @param params - Values for non-document path placeholders.
   * @returns All matching model instances.
   */
  static async all<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    params: Record<string, string> = {},
  ): Promise<T[]> {
    const Model = modelConstructor(this);
    return new QueryBuilder(Model.collection(params)).get();
  }

  /**
   * Creates and persists a new model.
   *
   * @param data - Initial field values.
   * @param options - Explicit id or path params.
   * @returns The persisted model.
   */
  static async create<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    data: Partial<ModelData<T>>,
    options?: string | CreateOptions,
  ): Promise<T> {
    const normalized = createOptions(options);
    const values: Record<string, unknown> = {
      ...(normalized.params ?? {}),
      ...(data as Record<string, unknown>),
    };
    if (normalized.id !== undefined) values['id'] = normalized.id;
    const model = new this(values) as T;
    await model.save({ create: true });
    return model;
  }

  /**
   * Updates an existing model.
   *
   * @param id - Document id.
   * @param data - Fields to change.
   * @param options - Path params.
   * @returns The updated model.
   * @throws `NotFoundError` when the document does not exist.
   */
  static async update<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    id: string,
    data: Partial<ModelData<T>>,
    options: MutationOptions = {},
  ): Promise<T> {
    const Model = modelConstructor(this);
    const model = await Model.findOrFail(id, options.params);
    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && value !== undefined) model.assign(key, value);
    }
    await model.save();
    return model;
  }

  /**
   * Creates a model or updates it when the id already exists.
   *
   * @param data - Field values.
   * @param options - Explicit id or path params.
   * @returns The persisted model.
   */
  static async upsert<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    data: Partial<ModelData<T>>,
    options?: string | CreateOptions,
  ): Promise<T> {
    const Model = modelConstructor(this);
    const normalized = createOptions(options);
    const dataId = (data as Record<string, unknown>)['id'];
    const id = normalized.id ?? (typeof dataId === 'string' ? dataId : undefined);
    if (id !== undefined && (await Model.exists(id, normalized.params)))
      return Model.update(id, data, { params: normalized.params });
    return Model.create(data, normalized);
  }

  /**
   * Deletes a document by id.
   *
   * Uses soft delete when the model enables it. Returns `false` when the
   * document does not exist.
   *
   * @param id - Document id.
   * @param options - Path params or a hard-delete override.
   * @returns `true` when a document was deleted.
   */
  static async delete<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    id: string,
    options: MutationOptions & { hard?: boolean } = {},
  ): Promise<boolean> {
    const Model = modelConstructor(this);
    const model = await Model.find(id, options.params);
    if (!model) return false;
    await model.delete({ hard: options.hard });
    return true;
  }

  /**
   * Counts documents in the collection.
   *
   * @param params - Values for non-document path placeholders.
   * @returns The number of documents.
   */
  static async count<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    params: Record<string, string> = {},
  ): Promise<number> {
    const Model = modelConstructor(this);
    const collection = Model.collection(params) as CollectionReference<T> & {
      count?: () => {
        get: () => Promise<{ data: () => { count: number } }>;
      };
    };
    if (typeof collection.count === 'function') {
      try {
        const snapshot = await collection.count().get();
        return snapshot.data().count;
      } catch (error) {
        throw new QueryError('Firestore count query failed', error);
      }
    }
    const snapshot = await collection.get();
    return snapshot.size ?? snapshot.docs.length;
  }

  /**
   * Checks whether a document exists.
   *
   * @param id - Document id.
   * @param params - Values for non-document path placeholders.
   * @returns `true` when the document exists.
   */
  static async exists<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    id: string,
    params: Record<string, string> = {},
  ): Promise<boolean> {
    const Model = modelConstructor(this);
    const snapshot = await Model.collection(params)
      .doc(Model.documentId(id))
      .get();
    return snapshot.exists;
  }

  /**
   * Persists several model instances in order.
   *
   * Unique fields still use their transactional guarantees. Use `batch()` if
   * you need a native Firestore batch and do not need ORM hook semantics.
   *
   * @param models - Models to save.
   * @param options - Optional partial-save field list.
   */
  static async saveMany<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    models: ReadonlyArray<T>,
    options: SaveOptions = {},
  ): Promise<void> {
    for (const model of models) await model.save(options);
  }

  /**
   * Creates and persists several models.
   *
   * @param records - Initial field values for each model.
   * @param options - Shared path params.
   * @returns The persisted models.
   */
  static async createMany<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    records: ReadonlyArray<Partial<ModelData<T>>>,
    options: BulkCreateOptions = {},
  ): Promise<T[]> {
    const Model = modelConstructor(this);
    const models: T[] = [];
    for (const record of records)
      models.push(await Model.create(record, { params: options.params }));
    return models;
  }

  /**
   * Deletes several documents by id.
   *
   * @param ids - Document ids.
   * @param options - Path params or hard-delete override.
   * @returns The number of documents deleted.
   */
  static async deleteMany<T extends FireObject<any>>(
    this: ModelConstructor<T>,
    ids: ReadonlyArray<string>,
    options: BulkDeleteOptions = {},
  ): Promise<number> {
    const Model = modelConstructor(this);
    let deleted = 0;
    for (const id of ids)
      if (await Model.delete(id, options)) deleted += 1;
    return deleted;
  }

  /**
   * Creates a native Firestore write batch.
   *
   * @returns A Firestore `WriteBatch`.
   * @throws If the model has no Firestore binding.
   */
  static batch<T extends FireObject<any>>(
    this: ModelConstructor<T>,
  ): WriteBatch {
    const Model = modelConstructor(this);
    if (!Model.Firestore) throw new Error(FIRESTORE_NOT_CONFIGURED);
    return Model.Firestore.batch();
  }

  /**
   * Runs a transaction against the model Firestore instance.
   *
   * Firestore retries contention failures according to `maxAttempts`.
   *
   * @param updateFunction - Transaction callback.
   * @param options - Retry and read-only options.
   * @returns The callback result.
   */
  static transaction<T extends FireObject<any>, TResult>(
    this: ModelConstructor<T>,
    updateFunction: (transaction: Transaction) => Promise<TResult>,
    options: TransactionOptions = {},
  ): Promise<TResult> {
    const Model = modelConstructor(this);
    if (!Model.Firestore) throw new Error(FIRESTORE_NOT_CONFIGURED);
    return Model.Firestore.runTransaction(updateFunction, options);
  }

  /**
   * Hook executed before every save.
   *
   * Prefer `beforeCreate` / `beforeUpdate` for new code. This hook is kept for
   * compatibility and still runs before validation and the Firestore write.
   */
  beforeSave?(): Promise<void> | void;

  /** Hook executed before a document is created. */
  beforeCreate?(): Promise<void> | void;

  /** Hook executed after a document is created. */
  afterCreate?(): Promise<void> | void;

  /** Hook executed before an existing document is updated. */
  beforeUpdate?(): Promise<void> | void;

  /** Hook executed after an existing document is updated. */
  afterUpdate?(): Promise<void> | void;

  /** Hook executed before a document is deleted. */
  beforeDelete?(): Promise<void> | void;

  /** Hook executed after a document is deleted. */
  afterDelete?(): Promise<void> | void;

  /** Hook executed after every successful save. */
  afterSave?(): Promise<void> | void;

  /** Optional parent path, commonly used by subcollection models. */
  parent?: string;

  /** Document id. Assigned automatically for new documents. */
  id!: string;

  /**
   * Creates a model instance.
   *
   * When given a Firestore snapshot, the snapshot id is copied into `id` and
   * the document data is normalized. When given a plain object, the object is
   * used as-is and field defaults are applied.
   *
   * @param snap - Firestore snapshot or plain record of field values.
   */
  constructor(snap: DocumentSnapshot<DocumentData> | Record<string, unknown>) {
    const isSnapshot = snap instanceof DocumentSnapshot;
    const values = isSnapshot ? { id: snap.id, ...(snap.data() || {}) } : snap;
    const data = {
      values: new Map<string, unknown>(),
      errors: new Map<string, string | null>(),
    };
    for (const [key, value] of Object.entries(values))
      data.values.set(key, normalizeValue(value));
    fireDataMap.set(this, data);
    const options = fieldOptions(this);
    for (const [key, value] of Object.entries(values)) {
      const deserialized =
        options.get(key)?.deserialize && value !== null && value !== undefined
          ? options.get(key)?.deserialize?.(value, data.values)
          : value;
      this.assign(key, deserialized);
    }

    if (!isSnapshot) {
      for (const [key, fieldOptions] of options) {
        if (fieldOptions.default === undefined) continue;
        if (fireDataMap.get(this)?.values.get(key) !== undefined) continue;
        this.assign(
          key,
          typeof fieldOptions.default === 'function'
            ? (fieldOptions.default as () => unknown)()
            : fieldOptions.default,
        );
      }
    }

    if (isSnapshot) this.#snapshot = snap;
    this.refreshValidation();
  }

  /** Whether the backing Firestore document currently exists. */
  get exists(): boolean {
    return this.#snapshot?.exists ?? false;
  }

  /** Firestore reference for the backing document, when available. */
  get ref(): DocumentReference<DocumentData> | undefined {
    return this.#snapshot?.ref;
  }

  /**
   * Returns the document id referenced by a relation field.
   *
   * @param propertyKey - Name of a field holding a model or document reference.
   * @returns The referenced id, or `null` when the field is not a reference.
   */
  getRefId(propertyKey: string): string | null {
    const value = fireDataMap.get(this)?.values.get(propertyKey);
    if (value instanceof DocumentReference || value instanceof FireObject) {
      return value.id || null;
    }
    return null;
  }

  /**
   * Reads a single field from the backing snapshot.
   *
   * @param fieldPath - Field name or Firestore field path.
   * @returns A promise resolving to a snapshot of the field, or `undefined`
   * when the instance has no snapshot.
   */
  get(
    fieldPath: string | FieldPath,
  ): Promise<DocumentSnapshot<DocumentData>> | undefined {
    return this.#snapshot?.get(fieldPath);
  }

  /**
   * Compares the backing snapshot with another snapshot.
   *
   * @param other - Snapshot to compare against.
   * @returns `true` when both snapshots are equal.
   */
  isEqual(other: DocumentSnapshot<DocumentData>): boolean {
    return this.#snapshot?.isEqual(other) ?? false;
  }

  /**
   * Deletes the backing Firestore document.
   *
   * Uses soft delete when the model enables it. Pass `{ hard: true }` to
   * permanently delete the document.
   *
   * @param options - Hard-delete override.
   * @returns The Firestore write result.
   */
  async delete(options: { hard?: boolean } = {}): Promise<WriteResult> {
    const soft = this.softDeleteConfiguration();
    if (soft && !options.hard) {
      await this.beforeDelete?.();
      const value = soft.value ?? new Date();
      const data: Record<string, unknown> = { [soft.field]: value };
      const timestamps = this.timestampConfiguration();
      if (timestamps) data[timestamps.updatedAt] = new Date();

      const reference = this.saveReference();
      const result = await reference.update(data);
      for (const [key, item] of Object.entries(data)) this.assign(key, item);
      const snapshot = await reference.get();
      this.#snapshot = snapshot;
      await this.afterDelete?.();
      return result;
    }

    const reference = this.saveReference();
    await this.beforeDelete?.();
    const result = await reference.delete();
    this.#snapshot = undefined;
    await this.afterDelete?.();
    return result;
  }

  /**
   * Restores a soft-deleted document by removing its delete marker.
   *
   * @returns The Firestore write result.
   * @throws `ConflictError` when the model does not use soft deletes.
   */
  async restore(): Promise<WriteResult> {
    const soft = this.softDeleteConfiguration();
    if (!soft)
      throw new ConflictError('Soft delete is not enabled for this model');
    const reference = this.saveReference();
    const result = await reference.update({
      [soft.field]: FirestoreFieldValue.delete(),
    });
    fireDataMap.get(this)?.values.delete(soft.field);
    fireDataMap.get(this)?.errors.delete(soft.field);
    this.#snapshot = await reference.get();
    return result;
  }

  /**
   * Serializes the instance into plain Firestore document data.
   *
   * Undefined values are omitted, field serializers run, nested models are
   * converted to their reference (or plain data), arrays containing models are
   * serialized, and the virtual `parent` field is removed.
   *
   * @returns Plain document data ready to be written to Firestore.
   */
  data(): Partial<TData> & DocumentData {
    const data = fireDataMap.get(this);
    if (!data) return {} as Partial<TData> & DocumentData;
    const options = fieldOptions(this);
    const result = Object.fromEntries(
      [...data.values.entries()]
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => {
          let serialized = options.get(key)?.serialize
            ? options.get(key)?.serialize?.(value, data.values)
            : value;
          if (serialized instanceof FireObject)
            serialized = serialized.ref ?? serialized.data();
          else if (Array.isArray(serialized)) {
            serialized = serialized.map((item) =>
              item instanceof FireObject ? (item.ref ?? item.data()) : item,
            );
          }
          return [key, serialized];
        })
        .filter(([, value]) => value !== undefined),
    );
    delete result['parent'];
    return result as Partial<TData> & DocumentData;
  }

  /**
   * Returns a JSON-friendly representation of the model.
   *
   * @returns The document id plus the serialized field values.
   */
  toJSON(): Partial<TData> & { id: string } {
    return { id: this.id, ...this.data() } as Partial<TData> & { id: string };
  }

  /**
   * Returns the validation errors recorded for the instance.
   *
   * @returns A map of field names to error messages, or `null` when valid.
   */
  getErrors(): Record<string, string | null> {
    const data = fireDataMap.get(this);
    return data ? Object.fromEntries(data.errors.entries()) : {};
  }

  /**
   * Checks whether every recorded field validation passed.
   *
   * @returns `true` when no field has an error.
   */
  isValid(): boolean {
    return Object.values(this.getErrors()).every((error) => error === null);
  }

  /**
   * Assigns a value, preserving decorated setters when present.
   *
   * @param key - Property name.
   * @param value - New value.
   */
  private assign(key: string, value: unknown): void {
    const setter = propertySetter(this, key);
    if (setter) {
      Reflect.set(this, key, value);
      return;
    }
    Reflect.set(this, key, value);
    fireDataMap.get(this)?.values.set(key, normalizeValue(value));
  }

  /**
   * Returns automatic timestamp configuration when enabled.
   *
   * @returns Timestamp field names, or `null`.
   */
  private timestampConfiguration(): {
    createdAt: string;
    updatedAt: string;
  } | null {
    const config = (this.constructor as FireObjectConstructor<this>).timestamps;
    if (!config) return null;
    if (config === true) return { createdAt: 'createdAt', updatedAt: 'updatedAt' };
    return {
      createdAt: config.createdAt ?? 'createdAt',
      updatedAt: config.updatedAt ?? 'updatedAt',
    };
  }

  /**
   * Applies automatic timestamps to the instance.
   *
   * @param creating - Whether the document is being created.
   */
  private applyTimestamps(creating: boolean): void {
    const config = this.timestampConfiguration();
    if (!config) return;
    const now = new Date();
    if (creating) this.assign(config.createdAt, now);
    this.assign(config.updatedAt, now);
  }

  /**
   * Returns soft-delete configuration when enabled.
   *
   * @returns Delete field and value, or `null`.
   */
  private softDeleteConfiguration(): {
    field: string;
    value: unknown;
  } | null {
    const config = (this.constructor as FireObjectConstructor<this>).softDelete;
    if (!config) return null;
    if (config === true) return { field: 'deletedAt', value: undefined };
    return {
      field: config.field ?? 'deletedAt',
      value: config.value,
    };
  }

  /**
   * Runs the pre-write hooks.
   *
   * @param creating - Whether the document is being created.
   */
  private async runBeforeWrite(creating: boolean): Promise<void> {
    await this.beforeSave?.();
    if (creating) await this.beforeCreate?.();
    else await this.beforeUpdate?.();
  }

  /**
   * Runs the post-write hooks.
   *
   * @param creating - Whether the document was created.
   */
  private async runAfterWrite(creating: boolean): Promise<void> {
    if (creating) await this.afterCreate?.();
    else await this.afterUpdate?.();
    await this.afterSave?.();
  }

  /**
   * Re-runs every field validator against the current in-memory values.
   */
  private refreshValidation(): void {
    const data = fireDataMap.get(this);
    if (!data) return;
    for (const [key, options] of fieldOptions(this)) {
      let errorMessage: string | null = null;
      for (const validator of fieldValidators(key, options)) {
        const result = validator(data.values.get(key), data.values);
        if (typeof result !== 'boolean' || !result) {
          errorMessage =
            typeof result === 'string' ? result : `Invalid value for ${key}`;
          break;
        }
      }
      data.errors.set(key, errorMessage);
    }
  }

  /**
   * Re-runs field validation and throws for the first invalid field.
   *
   * @throws `FieldValidationError` for the first invalid field.
   */
  private validateFields(): void {
    this.refreshValidation();
    const data = fireDataMap.get(this);
    if (!data) return;
    for (const [key, error] of data.errors)
      if (error) throw new FieldValidationError(key, error);
  }

  /**
   * Throws when an immutable field differs from its persisted value.
   *
   * @param previous - Document data previously stored in Firestore.
   * @throws `FieldValidationError` when an immutable field was changed.
   */
  private assertImmutable(
    previous: DocumentData | FireObject<any> | undefined,
  ): void {
    const stored = previous instanceof FireObject ? previous.data() : previous;
    if (!stored) return;
    const current = this.data();
    for (const [key, options] of fieldOptions(this)) {
      if (!options.immutable || !(key in stored)) continue;
      if (!valuesEqual(current[key], stored[key]))
        throw new FieldValidationError(key, `${key} is immutable`);
    }
  }

  /**
   * Adds automatic timestamp fields to a partial-save list.
   *
   * @param fields - Caller-provided field list.
   * @param creating - Whether the document is being created.
   * @returns The expanded field list, or `undefined` for a full save.
   */
  private expandFields(
    fields: readonly string[] | undefined,
    creating: boolean,
  ): readonly string[] | undefined {
    if (!fields) return undefined;
    const result = [...fields];
    const config = this.timestampConfiguration();
    if (config) {
      if (creating && !result.includes(config.createdAt))
        result.push(config.createdAt);
      if (!result.includes(config.updatedAt)) result.push(config.updatedAt);
    }
    return result;
  }

  /**
   * Resolves the Firestore document reference for this instance.
   *
   * Reuses the snapshot reference when available. Otherwise it builds the
   * reference from the model collection, allocating an id for new documents.
   *
   * @returns A document reference without a converter.
   */
  private saveReference(): DocumentReference<DocumentData> {
    if (this.ref) return this.ref.withConverter(null);
    const ctor = this.constructor as FireObjectConstructor<this>;
    const collection = ctor.collection(
      ctor.CollectionPattern
        ? instancePathParams(ctor.CollectionPattern, this)
        : {},
    );
    const reference = (
      this.id ? collection.doc(ctor.documentId(this.id)) : collection.doc()
    ).withConverter(null);
    if (!this.id) this.id = reference.id;
    return reference as DocumentReference<DocumentData>;
  }

  /**
   * Prepares a save inside a Firestore transaction.
   *
   * This method performs all reads needed for the write, including the current
   * document and unique-field reservations, and returns a closure that applies
   * the writes. Call the closure only after all other transaction reads are
   * finished, because Firestore requires reads before writes.
   *
   * Pre-write hooks run before the reads. Post-write hooks are not run by this
   * method; `save()` runs them after the transaction commits.
   *
   * @param transaction - Active Firestore transaction.
   * @param options - Optional reference, partial field list, and create flag.
   * @returns A closure that applies the prepared writes.
   * @throws `FieldValidationError` when a field is invalid or immutable.
   * @throws `UniqueFieldConflictError` when a reservation belongs to another
   * document.
   */
  async prepareSave(
    transaction: Transaction,
    options: {
      reference?: DocumentReference<DocumentData>;
      fields?: readonly string[];
      create?: boolean;
    } = {},
  ): Promise<() => void> {
    const reference = options.reference ?? this.saveReference();
    const creating = options.create ?? !this.#snapshot?.exists;
    this.applyTimestamps(creating);
    await this.runBeforeWrite(creating);
    fireDataMap.get(this)?.values.set('id', this.id);
    this.validateFields();
    const unique = uniqueFields(this);
    const snapshot = await transaction.get(reference);
    const previous = snapshot.data();
    this.assertImmutable(previous);
    const stored = previous instanceof FireObject ? previous.data() : previous;
    const reservations: Array<{
      next: DocumentReference<DocumentData>;
      old?: DocumentReference<DocumentData>;
      release: boolean;
    }> = [];
    for (const [key, config] of unique) {
      const value = Reflect.get(this, key) as string;
      const next = reference.firestore
        .collection(config.reservationCollection)
        .doc(encodeURIComponent(value));
      const claimed = await transaction.get(next);
      if (claimed.exists && claimed.data()?.['uid'] !== this.id)
        throw new UniqueFieldConflictError(key);
      const oldValue =
        stored?.[key] ??
        (config.allowOwnerId && snapshot.exists ? this.id : undefined);
      const old =
        typeof oldValue === 'string' && oldValue !== value
          ? reference.firestore
              .collection(config.reservationCollection)
              .doc(encodeURIComponent(oldValue))
          : undefined;
      const oldSnapshot = old ? await transaction.get(old) : undefined;
      reservations.push({
        next,
        old,
        release: oldSnapshot?.data()?.['uid'] === this.id,
      });
    }
    const data = this.data();
    const fields = this.expandFields(options.fields, creating);
    const payload = fields
      ? Object.fromEntries(
          fields
            .filter((key) => data[key] !== undefined)
            .map((key) => [key, data[key]]),
        )
      : data;
    for (const key of unique.keys()) payload[key] = data[key];
    const newPaths = new Set(
      reservations.map((reservation) => reservation.next.path),
    );
    return () => {
      for (const reservation of reservations)
        transaction.set(reservation.next, { uid: this.id });
      if (options.create) transaction.create(reference, payload);
      else if (snapshot.exists) transaction.update(reference, payload);
      else transaction.set(reference, payload);
      for (const reservation of reservations)
        if (
          reservation.old &&
          reservation.release &&
          !newPaths.has(reservation.old.path)
        )
          transaction.delete(reservation.old);
    };
  }

  /**
   * Persists the model to Firestore.
   *
   * Models with unique fields are saved inside a transaction so reservations
   * stay consistent. Other models are updated directly, created with a known
   * id, or added with an auto-generated id.
   *
   * @param options - Optional list of fields to write (partial update).
   * @returns The Firestore write result.
   */
  async save(options: SaveOptions = {}): Promise<WriteResult> {
    const creating = options.create ?? !this.#snapshot?.exists;

    if (uniqueFields(this).size) {
      const reference = this.saveReference();
      try {
        await reference.firestore.runTransaction(async (transaction) => {
          const write = await this.prepareSave(transaction, {
            reference,
            ...options,
          });
          write();
        });
      } catch (error) {
        if (options.create && isAlreadyExists(error))
          throw new ConflictError(
            `Document ${reference.path} already exists`,
            undefined,
            { cause: error },
          );
        throw error;
      }
      this.#snapshot = await reference.get();
      const writeTime = this.#snapshot.updateTime as Timestamp;
      const result = {
        writeTime,
        isEqual: (other: WriteResult) => writeTime.isEqual(other.writeTime),
      } as WriteResult;
      await this.runAfterWrite(creating);
      return result;
    }

    this.applyTimestamps(creating);
    await this.runBeforeWrite(creating);
    fireDataMap.get(this)?.values.set('id', this.id);
    this.validateFields();
    this.assertImmutable(this.#snapshot?.data());
    const values = this.data();
    const fields = this.expandFields(options.fields, creating);
    const data = fields
      ? Object.fromEntries(
          fields
            .filter((key) => values[key] !== undefined)
            .map((key) => [key, values[key]]),
        )
      : values;

    if (this.#snapshot && this.ref && !options.create) {
      const result = await this.ref.update(data);
      await this.runAfterWrite(creating);
      return result;
    }

    const ctor = this.constructor as FireObjectConstructor<this>;
    let collection = ctor.Collection;
    if (ctor.CollectionPattern?.includes(':')) {
      collection = ctor.collection(
        instancePathParams(ctor.CollectionPattern, this),
      );
    }
    if (!collection?.path) throw new Error('Collection not found');

    if (this.id) {
      const document = collection.doc(ctor.documentId(this.id));
      let result: WriteResult;
      try {
        result = options.create
          ? await document.create(data as WithFieldValue<this>)
          : await document.set(data as WithFieldValue<this>);
      } catch (error) {
        if (options.create && isAlreadyExists(error))
          throw new ConflictError(
            `Document ${document.path} already exists`,
            undefined,
            { cause: error },
          );
        throw error;
      }
      if (typeof document.get === 'function')
        this.#snapshot = await document.get();
      await this.runAfterWrite(creating);
      return result;
    }

    const docRef = await collection.add(data as WithFieldValue<this>);
    this.#snapshot = await docRef.get();
    await this.runAfterWrite(creating);
    return {
      writeTime: this.#snapshot.createTime as Timestamp,
      isEqual: () => false,
    } as WriteResult;
  }
}
