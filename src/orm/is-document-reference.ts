import { DocumentReference } from '@google-cloud/firestore';
import type { DocumentData } from '@google-cloud/firestore';

/**
 * Detects Firestore document references across SDK copies and test doubles.
 *
 * `instanceof` alone fails when an application loads a second copy of the
 * Firestore SDK. Firestore references always expose these members.
 *
 * @param value - Value to inspect.
 * @returns `true` when the value behaves like a document reference.
 */
export function isDocumentReference(
  value: unknown,
): value is DocumentReference<DocumentData> {
  if (value instanceof DocumentReference) return true;
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DocumentReference<DocumentData>>;
  return (
    typeof candidate.path === 'string' &&
    typeof candidate.get === 'function' &&
    typeof candidate.withConverter === 'function'
  );
}
