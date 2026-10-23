import {
  CollectionGroup,
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  FieldPath,
  FirestoreDataConverter,
  Query,
  Timestamp,
  WithFieldValue,
  WriteResult,
  Transaction,
} from '@google-cloud/firestore';
import type { FireObjectConstructor } from './types';
import { converter } from './converter';
import { fireDataMap } from './state';
import { normalizeValue } from './normalize-value';
import {
  uniqueFields,
  FieldValidationError,
  UniqueFieldConflictError,
} from './unique-metadata';
import {
  collectionPattern,
  fillCollectionPattern,
  instancePathParams,
} from './path';

/**
 * Base class for Firestore models.
 *
 * Models extend this class and declare fields with `@field`. The base class
 * provides persistence helpers (`save`, `prepareSave`, `delete`), query
 * helpers (`query`, `queryByPath`), validation state, and snapshot access.
 *
 * Instances can be created from a Firestore snapshot or from a plain object.
 * Field values are kept in an internal `WeakMap` and exposed through decorated
 * accessors.
 */
export abstract class FireObject {
  #snapshot?: DocumentSnapshot<DocumentData>;

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
  static collection<T extends FireObject>(
    this: FireObjectConstructor<T>,
    params: Record<string, string> = {},
  ): CollectionReference<T> {
    if (this.Collection?.path) return this.Collection;
    if (!this.CollectionPattern)
      throw new Error('Collection pattern not found');
    if (!this.Firestore)
      throw new Error(
        'Firestore instance not configured. Use @Connector(db, pattern) to bind a database to the model.',
      );

    return this.Firestore.collection(
      fillCollectionPattern(this.CollectionPattern, params),
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
  static collectionGroup<T extends FireObject>(
    this: FireObjectConstructor<T>,
  ): CollectionGroup<T> {
    if (!this.CollectionPattern)
      throw new Error('Collection pattern not found');
    if (!this.Firestore)
      throw new Error(
        'Firestore instance not configured. Use @Connector(db, pattern) to bind a database to the model.',
      );
    const segments = collectionPattern(this.CollectionPattern).split('/');
    const name = segments[segments.length - 1];
    if (!name || name.startsWith(':')) {
      throw new Error(`Invalid collection pattern: ${this.CollectionPattern}`);
    }
    return this.Firestore.collectionGroup(name).withConverter(
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
  static async query<T extends FireObject>(
    this: FireObjectConstructor<T>,
    ...constraints: Array<(query: Query<T>) => Query<T>>
  ): Promise<T[]> {
    let query: Query<T> = this.collection();
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
  static async queryByPath<T extends FireObject>(
    this: FireObjectConstructor<T>,
    params: Record<string, string>,
    ...constraints: Array<(query: Query<T>) => Query<T>>
  ): Promise<T[]> {
    let query: Query<T> = this.collection(params);
    for (const constraint of constraints) query = constraint(query);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data());
  }

  /**
   * Hook executed before every save.
   *
   * Use it to apply defaults or derived values. It runs before validation and
   * before the Firestore write.
   */
  abstract beforeSave(): Promise<void> | void;

  /** Optional parent path, commonly used by subcollection models. */
  parent?: string;

  /** Document id. Assigned automatically for new documents. */
  id!: string;

  /**
   * Creates a model instance.
   *
   * When given a Firestore snapshot, the snapshot id is copied into `id` and
   * the document data is normalized. When given a plain object, the object is
   * used as-is (after normalization).
   *
   * @param snap - Firestore snapshot or plain record of field values.
   */
  constructor(snap: DocumentSnapshot<DocumentData> | Record<string, unknown>) {
    const isSnapshot = snap instanceof DocumentSnapshot;
    const values = isSnapshot ? { id: snap.id, ...(snap.data() || {}) } : snap;
    const entries = Object.entries(values).map(
      ([key, value]): [string, unknown] => [key, normalizeValue(value)],
    );
    fireDataMap.set(this, {
      values: new Map(entries),
      errors: new Map(),
    });
    for (const [key, value] of entries) Reflect.set(this, key, value);
    if (isSnapshot) this.#snapshot = snap;
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
   * @returns The Firestore write result, or `undefined` when the instance has
   * no reference.
   */
  delete(): Promise<WriteResult> | undefined {
    return this.ref?.delete();
  }

  /**
   * Serializes the instance into plain Firestore document data.
   *
   * Undefined values are omitted, nested models are converted to their
   * reference (or plain data), arrays containing models are serialized, and the
   * virtual `parent` field is removed.
   *
   * @returns Plain document data ready to be written to Firestore.
   */
  data(): Partial<DocumentData> {
    const data = fireDataMap.get(this);
    if (!data) return {};
    const result = Object.fromEntries(
      [...data.values.entries()]
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => {
          if (value instanceof FireObject)
            return [key, value.ref ?? value.data()];
          if (Array.isArray(value)) {
            return [
              key,
              value.map((item) =>
                item instanceof FireObject ? (item.ref ?? item.data()) : item,
              ),
            ];
          }
          return [key, value];
        }),
    );
    delete result['parent'];
    return result;
  }

  /**
   * Returns a JSON-friendly representation of the model.
   *
   * @returns The document id plus the serialized field values.
   */
  toJSON(): Record<string, unknown> {
    return { id: this.id, ...this.data() };
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
   * @param transaction - Active Firestore transaction.
   * @param options - Optional reference, partial field list, and create flag.
   * @returns A closure that applies the prepared writes.
   * @throws `FieldValidationError` when a unique field is invalid.
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
    await this.beforeSave?.();
    fireDataMap.get(this)?.values.set('id', this.id);
    const unique = uniqueFields(this);
    for (const key of unique.keys()) {
      // Revalidate against the final owner id, including fields missing at construction.
      Reflect.set(this, key, Reflect.get(this, key));
      const error = this.getErrors()[key];
      if (error) throw new FieldValidationError(key, error);
    }
    const ownerId = this.id;
    const snapshot = await transaction.get(reference);
    const previous = snapshot.data();
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
      if (claimed.exists && claimed.data()?.['uid'] !== ownerId)
        throw new UniqueFieldConflictError(key);
      const oldValue =
        stored?.[key] ??
        (config.allowOwnerId && snapshot.exists ? ownerId : undefined);
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
        release: oldSnapshot?.data()?.['uid'] === ownerId,
      });
    }
    const data = this.data();
    const payload = options.fields
      ? Object.fromEntries(
          options.fields
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
        transaction.set(reservation.next, { uid: ownerId });
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
  async save(
    options: { fields?: readonly string[] } = {},
  ): Promise<WriteResult> {
    if (uniqueFields(this).size) {
      const reference = this.saveReference();
      await reference.firestore.runTransaction(async (transaction) => {
        const write = await this.prepareSave(transaction, {
          reference,
          ...options,
        });
        write();
      });
      this.#snapshot = await reference.get();
      const writeTime = this.#snapshot.updateTime as Timestamp;
      return {
        writeTime,
        isEqual: (other) => writeTime.isEqual(other.writeTime),
      } as WriteResult;
    }

    await this.beforeSave?.();
    const values = this.data();
    const data = options.fields
      ? Object.fromEntries(
          options.fields
            .filter((key) => values[key] !== undefined)
            .map((key) => [key, values[key]]),
        )
      : values;

    if (this.#snapshot && this.ref) return this.ref.update(data);

    const ctor = this.constructor as FireObjectConstructor<this>;
    let collection = ctor.Collection;
    if (ctor.CollectionPattern?.includes(':')) {
      collection = ctor.collection(
        instancePathParams(ctor.CollectionPattern, this),
      );
    }
    if (!collection?.path) throw new Error('Collection not found');

    if (this.id) {
      return collection
        .doc(ctor.documentId(this.id))
        .set(data as WithFieldValue<this>);
    }

    const docRef = await collection.add(data as WithFieldValue<this>);
    this.#snapshot = await docRef.get();
    return {
      writeTime: this.#snapshot.createTime as Timestamp,
      isEqual: () => false,
    } as WriteResult;
  }
}
