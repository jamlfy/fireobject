import {
  CollectionGroup,
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
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
import { getFirestore } from './config';
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

export abstract class FireObject {
  #snapshot?: DocumentSnapshot<DocumentData>;

  static documentId(value: string): string {
    return encodeURIComponent(value);
  }

  static collection<T extends FireObject>(
    this: FireObjectConstructor<T>,
    params: Record<string, string> = {},
  ): CollectionReference<T> {
    if (this.Collection?.path) return this.Collection;
    if (!this.CollectionPattern)
      throw new Error('Collection pattern not found');

    return (this.Firestore ?? getFirestore())
      .collection(fillCollectionPattern(this.CollectionPattern, params))
      .withConverter(
        converter(
          this as unknown as new (snap: DocumentSnapshot<DocumentData>) => T,
        ) as unknown as FirestoreDataConverter<T>,
      );
  }

  static collectionGroup<T extends FireObject>(
    this: FireObjectConstructor<T>,
  ): CollectionGroup<T> {
    if (!this.CollectionPattern)
      throw new Error('Collection pattern not found');
    const segments = collectionPattern(this.CollectionPattern).split('/');
    const name = segments[segments.length - 1];
    if (!name || name.startsWith(':')) {
      throw new Error(`Invalid collection pattern: ${this.CollectionPattern}`);
    }
    return getFirestore().collectionGroup(name).withConverter(
      converter(
        this as unknown as new (snap: DocumentSnapshot<DocumentData>) => T,
      ) as unknown as FirestoreDataConverter<T>,
    );
  }

  static async query<T extends FireObject>(
    this: FireObjectConstructor<T>,
    ...constraints: Array<(query: Query<T>) => Query<T>>
  ): Promise<T[]> {
    let query: Query<T> = this.collection();
    for (const constraint of constraints) query = constraint(query);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data());
  }

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

  abstract beforeSave(): Promise<void> | void;
  parent?: string;
  id!: string;

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

  get exists(): boolean {
    return this.#snapshot?.exists ?? false;
  }

  get ref(): DocumentReference<DocumentData> | undefined {
    return this.#snapshot?.ref;
  }

  getRefId(propertyKey: string): string | null {
    const value = fireDataMap.get(this)?.values.get(propertyKey);
    if (value instanceof DocumentReference || value instanceof FireObject) {
      return value.id || null;
    }
    return null;
  }

  get(
    fieldPath: string | FirebaseFirestore.FieldPath,
  ): Promise<DocumentSnapshot<DocumentData>> | undefined {
    return this.#snapshot?.get(fieldPath);
  }

  isEqual(other: DocumentSnapshot<DocumentData>): boolean {
    return this.#snapshot?.isEqual(other) ?? false;
  }

  delete(): Promise<WriteResult> | undefined {
    return this.ref?.delete();
  }

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

  toJSON(): Record<string, unknown> {
    return { id: this.id, ...this.data() };
  }

  getErrors(): Record<string, string | null> {
    const data = fireDataMap.get(this);
    return data ? Object.fromEntries(data.errors.entries()) : {};
  }

  isValid(): boolean {
    return Object.values(this.getErrors()).every((error) => error === null);
  }

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

  /** Perform every read first; invoke the returned closure only after other transaction reads. */
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
