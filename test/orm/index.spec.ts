import { FireObject, field, converter } from '../../src/orm/index';
import {
  CollectionReference,
  DocumentSnapshot,
  Timestamp,
} from '@google-cloud/firestore';

const set = vi.fn();
const doc = vi.fn(() => ({ set }));

class TestFireObject extends FireObject {
  static Collection = {
    path: 'Tests',
    doc,
  } as unknown as CollectionReference<TestFireObject>;

  beforeSave(): void {
    return;
  }
}

describe('FireObject', () => {
  class DatedObject extends TestFireObject {
    @field([(value) => value instanceof Date || 'Expected Date'])
    declare createdAt: Date;

    @field()
    declare ingestion: { verifiedAt: Date };
  }

  it('normalizes constructor values before validation and persistence', () => {
    const timestamp = new Timestamp(1790450080, 361000000);
    const input = {
      createdAt: timestamp,
      ingestion: { verifiedAt: timestamp },
    };
    const model = new DatedObject(input);
    expect(model.createdAt).toEqual(timestamp.toDate());
    expect(model.ingestion.verifiedAt).toEqual(timestamp.toDate());
    expect(model.isValid()).toBe(true);
    expect(model.data()).toMatchObject({
      createdAt: timestamp.toDate(),
      ingestion: { verifiedAt: timestamp.toDate() },
    });
    expect(input.createdAt).toBe(timestamp);
    expect(input.ingestion.verifiedAt).toBe(timestamp);
  });

  it('normalizes later field assignments before validation', () => {
    const model = new DatedObject({});
    const timestamp = { _seconds: 1790450080, _nanoseconds: 361000000 };
    Reflect.set(model, 'createdAt', timestamp);
    Reflect.set(model, 'ingestion', { verifiedAt: timestamp });
    expect(model.createdAt).toEqual(new Date(1790450080361));
    expect(model.ingestion.verifiedAt).toEqual(model.createdAt);
    expect(model.isValid()).toBe(true);
    Reflect.set(model, 'createdAt', { seconds: 1, nanoseconds: -1 });
    expect(model.getErrors()['createdAt']).toBe('Expected Date');
  });

  it('normalizes snapshots loaded through the Firestore converter', () => {
    const timestamp = new Timestamp(1790450080, 361000000);
    const snapshot = Object.create(DocumentSnapshot.prototype);
    Object.defineProperties(snapshot, {
      id: { value: 'from-snapshot' },
      data: { value: () => ({ createdAt: timestamp }) },
      exists: { value: true },
    });
    const model = converter(DatedObject).fromFirestore(snapshot);
    expect(model.id).toBe('from-snapshot');
    expect(model.exists).toBe(true);
    expect(model.createdAt).toEqual(timestamp.toDate());
    expect(model.isValid()).toBe(true);
  });

  it('creates a Firestore-safe document id', () => {
    expect(TestFireObject.documentId('@scope/package')).toBe(
      '%40scope%2Fpackage',
    );
  });

  it('uses the Firestore-safe id when saving through the base class', async () => {
    set.mockResolvedValue({});
    const model = new TestFireObject({ id: '@scope/package' });

    await model.save();

    expect(model.id).toBe('@scope/package');
    expect(doc).toHaveBeenCalledWith('%40scope%2Fpackage');
    expect(set).toHaveBeenCalledWith({ id: '@scope/package' });
  });

  it('omits absent optional fields while preserving null values for Firestore', async () => {
    const model = new TestFireObject({
      id: 'optional',
      absent: undefined,
      explicit: null,
    });
    await model.save();
    expect(set).toHaveBeenLastCalledWith({ id: 'optional', explicit: null });
  });

  it('resolves parameterized collection paths', () => {
    const resolved = { path: 'Packages/demo/Versions' };
    const collection = vi.fn(() => ({
      withConverter: vi.fn(() => resolved),
    }));

    class PatternFireObject extends FireObject {
      static CollectionPattern = 'Packages/:packageId/Versions/:version';
      static Firestore = {
        collection,
      } as unknown as import('@google-cloud/firestore').Firestore;

      beforeSave(): void {
        return;
      }
    }

    expect(PatternFireObject.collection({ packageId: 'demo' })).toBe(resolved);
    expect(collection).toHaveBeenCalledWith('Packages/demo/Versions');
  });

  it('rejects a parameterized path with missing values', () => {
    class PatternFireObject extends FireObject {
      static CollectionPattern = 'Packages/:packageId/Versions/:version';
      static Firestore = {
        collection: vi.fn(),
      } as unknown as import('@google-cloud/firestore').Firestore;
      beforeSave(): void {
        return;
      }
    }

    expect(() => PatternFireObject.collection()).toThrow(
      'Missing param "packageId"',
    );
  });

  it('expands a nested parent document path into subcollection params', () => {
    const resolved = {
      path: 'Packages/demo/Versions/1.0.0/Certifications',
    };
    const collection = vi.fn(() => ({
      withConverter: vi.fn(() => resolved),
    }));

    class CertificationObject extends FireObject {
      static CollectionPattern =
        'Packages/:parent/Versions/:version/Certifications/:certification';
      static Firestore = {
        collection,
      } as unknown as import('@google-cloud/firestore').Firestore;

      beforeSave(): void {
        return;
      }
    }

    expect(
      CertificationObject.collection({
        parent: 'Packages/demo/Versions/1.0.0',
      }),
    ).toBe(resolved);
    expect(collection).toHaveBeenCalledWith(
      'Packages/demo/Versions/1.0.0/Certifications',
    );
  });
});
