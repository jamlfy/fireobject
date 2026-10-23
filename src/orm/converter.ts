import type {
  DocumentData,
  DocumentSnapshot,
  WithFieldValue,
} from '@google-cloud/firestore';
import type { FireObject } from './object';

export const converter = <T extends FireObject>(
  Type: new (snap: DocumentSnapshot<DocumentData>) => T,
) => ({
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
  fromFirestore: (snap: DocumentSnapshot<DocumentData>): T => new Type(snap),
});
