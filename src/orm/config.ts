import type { Firestore } from '@google-cloud/firestore';

let defaultFirestore: Firestore | undefined;

export function setFirestore(db: Firestore): void {
  defaultFirestore = db;
}

export function getFirestore(): Firestore {
  if (!defaultFirestore) {
    throw new Error(
      'Firestore instance not configured. Call setFirestore(db) before using FireObject without @Connector.',
    );
  }
  return defaultFirestore;
}
