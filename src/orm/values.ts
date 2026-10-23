import { FieldValue as FirestoreFieldValue } from '@google-cloud/firestore';

/**
 * Creates a server timestamp sentinel.
 *
 * @returns A Firestore field value resolved by the server on write.
 */
export const serverTimestamp = (): FirestoreFieldValue =>
  FirestoreFieldValue.serverTimestamp();

/**
 * Creates an increment sentinel.
 *
 * @param value - Amount added atomically by Firestore.
 * @returns A Firestore field value.
 */
export const increment = (value: number): FirestoreFieldValue =>
  FirestoreFieldValue.increment(value);

/**
 * Creates an array-union sentinel.
 *
 * @param elements - Elements added atomically without duplicates.
 * @returns A Firestore field value.
 */
export const arrayUnion = (...elements: unknown[]): FirestoreFieldValue =>
  FirestoreFieldValue.arrayUnion(...elements);

/**
 * Creates an array-remove sentinel.
 *
 * @param elements - Elements removed atomically.
 * @returns A Firestore field value.
 */
export const arrayRemove = (...elements: unknown[]): FirestoreFieldValue =>
  FirestoreFieldValue.arrayRemove(...elements);

/**
 * Creates a delete sentinel used to remove a field during an update.
 *
 * @returns A Firestore field value.
 */
export const deleteField = (): FirestoreFieldValue =>
  FirestoreFieldValue.delete();

/**
 * Firestore sentinel helpers re-exported under a stable ORM namespace.
 */
export const FieldValue = {
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  deleteField,
} as const;
