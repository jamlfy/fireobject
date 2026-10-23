import type {
  DocumentData,
  DocumentSnapshot,
  WithFieldValue,
} from '@google-cloud/firestore';
import type { FireObject } from './object';

/**
 * Creates a Firestore converter for an ORM model.
 *
 * The converter is used by collections bound with `@Connector` and by
 * `FireObject.collection()`, so every snapshot read from Firestore is hydrated
 * into a model instance.
 *
 * @param Type - Model constructor that accepts a document snapshot.
 * @returns A Firestore converter that serializes model instances and
 * hydrates snapshots into model instances.
 */
export const converter = <T extends FireObject>(
  Type: new (snap: DocumentSnapshot<DocumentData>) => T,
) => ({
  /**
   * Serializes a model instance before writing it to Firestore.
   *
   * Falls back to the raw object when the value is not a `FireObject`, which
   * allows partial updates and native Firestore values to pass through.
   *
   * @param data - Model instance or plain data to serialize.
   * @returns Plain Firestore document data.
   */
  toFirestore: (data: Partial<WithFieldValue<T>>): DocumentData => {
    if (
      data &&
      typeof data === 'object' &&
      'data' in data &&
      typeof data.data === 'function'
    ) {
      return data.data() as DocumentData;
    }
    return data as DocumentData;
  },
  /**
   * Hydrates a Firestore snapshot into a model instance.
   *
   * @param snap - Snapshot returned by Firestore.
   * @returns A new model instance.
   */
  fromFirestore: (snap: DocumentSnapshot<DocumentData>): T => new Type(snap),
});
