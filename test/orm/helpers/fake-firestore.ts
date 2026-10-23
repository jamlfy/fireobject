import { DocumentSnapshot } from '@google-cloud/firestore';
import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  FirestoreDataConverter,
  Query,
  QuerySnapshot,
  WriteBatch,
  WriteResult,
} from '@google-cloud/firestore';

export const records = new Map<string, Record<string, unknown>>();
let autoId = 0;

export const resetFakeFirestore = (): void => {
  records.clear();
  autoId = 0;
};

const same = (left: unknown, right: unknown): boolean => {
  if (left instanceof Date && right instanceof Date)
    return left.getTime() === right.getTime();
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((item, index) => same(item, right[index]))
    );
  return JSON.stringify(left) === JSON.stringify(right);
};

const matches = (
  data: Record<string, unknown>,
  conditions: Array<{
    field: string;
    operator: string;
    value: unknown;
  }>,
): boolean =>
  conditions.every(({ field, operator, value }) => {
    const current = data[field];
    switch (operator) {
      case '==':
        return same(current, value);
      case '!=':
        return !same(current, value);
      case '<':
        return (current as number) < (value as number);
      case '<=':
        return (current as number) <= (value as number);
      case '>':
        return (current as number) > (value as number);
      case '>=':
        return (current as number) >= (value as number);
      case 'in':
        return (value as unknown[]).some((item) => same(current, item));
      case 'not-in':
        return !(value as unknown[]).some((item) => same(current, item));
      case 'array-contains':
        return (
          Array.isArray(current) &&
          current.some((item) => same(item, value))
        );
      case 'array-contains-any':
        return (
          Array.isArray(current) &&
          (value as unknown[]).some((item) =>
            current.some((entry) => same(entry, item)),
          )
        );
      default:
        throw new Error(`Unsupported operator ${operator}`);
    }
  });

const rawSnapshot = (
  path: string,
  ref: DocumentReference<DocumentData>,
): DocumentSnapshot<DocumentData> => {
  const snapshot = Object.create(DocumentSnapshot.prototype);
  const value = records.get(path);
  Object.defineProperties(snapshot, {
    id: { value: path.split('/').pop() },
    exists: { value: records.has(path) },
    data: { value: () => value },
    ref: { value: ref },
    updateTime: { value: { toDate: () => new Date(0) } },
    createTime: { value: { toDate: () => new Date(0) } },
  });
  return snapshot as DocumentSnapshot<DocumentData>;
};

const hydratedSnapshot = (
  path: string,
  ref: DocumentReference<DocumentData>,
  converter?: FirestoreDataConverter<unknown>,
): DocumentSnapshot<DocumentData> => {
  const raw = rawSnapshot(path, ref);
  if (!converter) return raw;
  const model = converter.fromFirestore(raw as never);
  const snapshot = Object.create(DocumentSnapshot.prototype);
  Object.defineProperties(snapshot, {
    id: { value: raw.id },
    exists: { value: raw.exists },
    data: { value: () => model },
    ref: { value: ref },
    updateTime: { value: raw.updateTime },
    createTime: { value: raw.createTime },
  });
  return snapshot as DocumentSnapshot<DocumentData>;
};

const applyData = (
  current: Record<string, unknown>,
  update: Record<string, unknown>,
): Record<string, unknown> => {
  const next = { ...current };
  for (const [key, value] of Object.entries(update)) {
    if (value?.constructor?.name === 'DeleteTransform') delete next[key];
    else next[key] = value;
  }
  return next;
};

function documentReference(
  path: string,
  converter?: FirestoreDataConverter<unknown>,
): DocumentReference<DocumentData> {
  const ref: DocumentReference<DocumentData> = {
    path,
    id: path.split('/').pop() as string,
    firestore: database as never,
    withConverter: (next) => documentReference(path, next as never),
    get: async () => hydratedSnapshot(path, ref, converter),
    set: async (data: Record<string, unknown>) => {
      records.set(path, { ...data });
      return { writeTime: { toDate: () => new Date() } } as WriteResult;
    },
    update: async (data: Record<string, unknown>) => {
      if (!records.has(path)) throw new Error('NOT_FOUND');
      records.set(path, applyData(records.get(path) ?? {}, data));
      return { writeTime: { toDate: () => new Date() } } as WriteResult;
    },
    delete: async () => {
      records.delete(path);
      return { writeTime: { toDate: () => new Date() } } as WriteResult;
    },
    create: async (data: Record<string, unknown>) => {
      if (records.has(path)) throw new Error('ALREADY_EXISTS');
      records.set(path, { ...data });
      return { writeTime: { toDate: () => new Date() } } as WriteResult;
    },
  } as unknown as DocumentReference<DocumentData>;
  return ref;
}

class FakeQuery {
  constructor(
    readonly path: string,
    readonly converter?: FirestoreDataConverter<unknown>,
    readonly state: {
      where?: Array<{ field: string; operator: string; value: unknown }>;
      order?: Array<{ field: string; direction: 'asc' | 'desc' }>;
      limit?: number;
      offset?: number;
      cursor?: unknown;
    } = {},
  ) {}

  private clone(change: Partial<typeof this.state>): FakeQuery {
    return new FakeQuery(this.path, this.converter, {
      ...this.state,
      ...change,
    });
  }

  where(field: string, operator: string, value: unknown): FakeQuery {
    return this.clone({
      where: [...(this.state.where ?? []), { field, operator, value }],
    });
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): FakeQuery {
    return this.clone({
      order: [...(this.state.order ?? []), { field, direction }],
    });
  }

  limit(limit: number): FakeQuery {
    return this.clone({ limit });
  }

  offset(offset: number): FakeQuery {
    return this.clone({ offset });
  }

  startAfter(...values: unknown[]): FakeQuery {
    return this.clone({ cursor: values[0] });
  }

  startAt(...values: unknown[]): FakeQuery {
    return this.clone({ cursor: values[0] });
  }

  endBefore(...values: unknown[]): FakeQuery {
    return this.clone({ cursor: values[0] });
  }

  endAt(...values: unknown[]): FakeQuery {
    return this.clone({ cursor: values[0] });
  }

  private documents(): Array<{ path: string; data: Record<string, unknown> }> {
    let entries = [...records.entries()]
      .filter(([path]) => path.split('/')[0] === this.path)
      .map(([path, data]) => ({ path, data }));
    entries = entries.filter(({ data }) =>
      matches(data, this.state.where ?? []),
    );
    for (const { field, direction } of [...(this.state.order ?? [])].reverse())
      entries.sort((left, right) => {
        const a = left.data[field] as number;
        const b = right.data[field] as number;
        return direction === 'asc'
          ? a > b
            ? 1
            : a < b
              ? -1
              : 0
          : a < b
            ? 1
            : a > b
              ? -1
              : 0;
      });
    if (this.state.cursor !== undefined) {
      const id =
        typeof this.state.cursor === 'object' && this.state.cursor
          ? (this.state.cursor as { id?: string }).id
          : undefined;
      if (id) {
        const index = entries.findIndex(
          ({ path }) => path.split('/').pop() === id,
        );
        if (index >= 0) entries = entries.slice(index + 1);
      }
    }
    if (this.state.offset) entries = entries.slice(this.state.offset);
    if (this.state.limit !== undefined)
      entries = entries.slice(0, this.state.limit);
    return entries;
  }

  async get(): Promise<QuerySnapshot<DocumentData>> {
    const docs = this.documents().map(({ path }) => {
      const ref = documentReference(path);
      return {
        id: ref.id,
        exists: true,
        ref,
        data: () => {
          const raw = rawSnapshot(path, ref);
          const model = this.converter
            ? this.converter.fromFirestore(raw as never)
            : records.get(path);
          return model;
        },
      };
    });
    return { docs, size: docs.length } as unknown as QuerySnapshot<DocumentData>;
  }

  count() {
    return {
      get: async () => ({
        data: () => ({ count: this.documents().length }),
      }),
    };
  }
}

function collectionReference(
  path: string,
  converter?: FirestoreDataConverter<unknown>,
): CollectionReference<DocumentData> {
  const query = new FakeQuery(path, converter);
  const collection = {
    path,
    firestore: database as never,
    withConverter: (next: FirestoreDataConverter<unknown>) =>
      collectionReference(path, next),
    doc: (id = `generated-${++autoId}`) =>
      documentReference(`${path}/${id}`, converter),
    add: async (data: Record<string, unknown>) => {
      const id = `generated-${++autoId}`;
      const ref = documentReference(`${path}/${id}`, converter);
      records.set(`${path}/${id}`, { ...data });
      return ref;
    },
    where: (...args: Parameters<Query['where']>) =>
      query.where(...(args as [string, string, unknown])),
    orderBy: (...args: Parameters<Query['orderBy']>) =>
      query.orderBy(...(args as [string, 'asc' | 'desc'])),
    limit: (limit: number) => query.limit(limit),
    offset: (offset: number) => query.offset(offset),
    startAfter: (...values: unknown[]) => query.startAfter(...values),
    startAt: (...values: unknown[]) => query.startAt(...values),
    endBefore: (...values: unknown[]) => query.endBefore(...values),
    endAt: (...values: unknown[]) => query.endAt(...values),
    count: () => query.count(),
    get: () => query.get(),
  } as unknown as CollectionReference<DocumentData>;
  return collection;
}

export const database = {
  collection: (path: string) => collectionReference(path),
  batch: () => {
    const operations: Array<() => void> = [];
    const batch = {
      set: (ref: DocumentReference<DocumentData>, data: Record<string, unknown>) => {
        operations.push(() => records.set(ref.path, { ...data }));
        return batch;
      },
      update: (ref: DocumentReference<DocumentData>, data: Record<string, unknown>) => {
        operations.push(() =>
          records.set(
            ref.path,
            applyData(records.get(ref.path) ?? {}, data),
          ),
        );
        return batch;
      },
      delete: (ref: DocumentReference<DocumentData>) => {
        operations.push(() => records.delete(ref.path));
        return batch;
      },
      create: (ref: DocumentReference<DocumentData>, data: Record<string, unknown>) => {
        operations.push(() => {
          if (records.has(ref.path)) throw new Error('ALREADY_EXISTS');
          records.set(ref.path, { ...data });
        });
        return batch;
      },
      commit: async () => {
        for (const operation of operations) operation();
        return [{ writeTime: { toDate: () => new Date() } }];
      },
    };
    return batch as unknown as WriteBatch;
  },
  runTransaction: async <T>(
    callback: (transaction: unknown) => Promise<T>,
  ): Promise<T> =>
    callback({
      get: async (ref: DocumentReference<DocumentData>) =>
        rawSnapshot(ref.path, ref),
      set: (ref: DocumentReference<DocumentData>, data: Record<string, unknown>) =>
        records.set(ref.path, { ...data }),
      update: (ref: DocumentReference<DocumentData>, data: Record<string, unknown>) =>
        records.set(ref.path, applyData(records.get(ref.path) ?? {}, data)),
      create: (ref: DocumentReference<DocumentData>, data: Record<string, unknown>) => {
        if (records.has(ref.path)) throw new Error('ALREADY_EXISTS');
        records.set(ref.path, { ...data });
      },
      delete: (ref: DocumentReference<DocumentData>) =>
        records.delete(ref.path),
    }),
};
