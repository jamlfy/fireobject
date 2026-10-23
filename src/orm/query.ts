import { Filter } from '@google-cloud/firestore';
import type {
  DocumentSnapshot,
  FieldPath,
  OrderByDirection,
  Query,
  WhereFilterOp,
} from '@google-cloud/firestore';
import type { FireObject } from './object';
import type {
  ModelField,
  Page,
  PaginationOptions,
} from './types';
import { QueryError } from './errors';

/**
 * Immutable-style query builder bound to a `FireObject` model.
 *
 * Every method returns the same builder so calls can be chained. The builder
 * only executes against Firestore when `get`, `first`, `count`, or `paginate`
 * is called.
 */
export class QueryBuilder<
  T extends FireObject<Record<string, unknown>> = FireObject<
    Record<string, unknown>
  >,
> {
  #query: Query<T>;

  /**
   * @param query - Firestore query already bound to the model converter.
   */
  constructor(query: Query<T>) {
    this.#query = query;
  }

  /** Underlying Firestore query. */
  get query(): Query<T> {
    return this.#query;
  }

  /**
   * Adds a composed Firestore filter.
   *
   * @param filter - Filter created with `Filter.where`, `Filter.and`, or
   * `Filter.or`.
   * @returns This builder.
   */
  where(filter: Filter): this;
  /**
   * Adds a field filter.
   *
   * @param field - Model field or Firestore field path.
   * @param operator - Firestore comparison operator.
   * @param value - Value compared against the field.
   * @returns This builder.
   */
  where<K extends ModelField<T>>(
    field: K | FieldPath,
    operator: WhereFilterOp,
    value: unknown,
  ): this;
  where<K extends ModelField<T>>(
    fieldOrFilter: Filter | K | FieldPath,
    operator?: WhereFilterOp,
    value?: unknown,
  ): this {
    if (fieldOrFilter instanceof Filter)
      this.#query = this.#query.where(fieldOrFilter);
    else
      this.#query = this.#query.where(
        fieldOrFilter as string | FieldPath,
        operator as WhereFilterOp,
        value,
      );
    return this;
  }

  /**
   * Adds an ordering clause.
   *
   * @param field - Model field or Firestore field path.
   * @param direction - Sort direction. Defaults to ascending.
   * @returns This builder.
   */
  orderBy<K extends ModelField<T>>(
    field: K | FieldPath,
    direction: OrderByDirection = 'asc',
  ): this {
    this.#query = this.#query.orderBy(field as string | FieldPath, direction);
    return this;
  }

  /**
   * Limits the number of returned documents.
   *
   * @param limit - Maximum document count.
   * @returns This builder.
   */
  limit(limit: number): this {
    this.#query = this.#query.limit(limit);
    return this;
  }

  /**
   * Skips a number of documents.
   *
   * @param offset - Number of documents to skip.
   * @returns This builder.
   */
  offset(offset: number): this {
    this.#query = this.#query.offset(offset);
    return this;
  }

  /**
   * Starts after a cursor.
   *
   * @param values - Document snapshot or field values used as cursor.
   * @returns This builder.
   */
  startAfter(...values: unknown[]): this {
    this.#query = this.#query.startAfter(
      ...(values as Parameters<Query<T>['startAfter']>),
    );
    return this;
  }

  /**
   * Starts at a cursor.
   *
   * @param values - Document snapshot or field values used as cursor.
   * @returns This builder.
   */
  startAt(...values: unknown[]): this {
    this.#query = this.#query.startAt(
      ...(values as Parameters<Query<T>['startAt']>),
    );
    return this;
  }

  /**
   * Ends before a cursor.
   *
   * @param values - Document snapshot or field values used as cursor.
   * @returns This builder.
   */
  endBefore(...values: unknown[]): this {
    this.#query = this.#query.endBefore(
      ...(values as Parameters<Query<T>['endBefore']>),
    );
    return this;
  }

  /**
   * Ends at a cursor.
   *
   * @param values - Document snapshot or field values used as cursor.
   * @returns This builder.
   */
  endAt(...values: unknown[]): this {
    this.#query = this.#query.endAt(
      ...(values as Parameters<Query<T>['endAt']>),
    );
    return this;
  }

  /**
   * Executes the query.
   *
   * @returns The matching model instances.
   * @throws `QueryError` when Firestore rejects the query.
   */
  async get(): Promise<T[]> {
    try {
      const snapshot = await this.#query.get();
      return snapshot.docs.map((doc) => doc.data());
    } catch (error) {
      throw new QueryError('Firestore query failed', error);
    }
  }

  /**
   * Executes the query and returns the first result.
   *
   * @returns The first model, or `null` when no document matches.
   */
  async first(): Promise<T | null> {
    const items = await this.limit(1).get();
    return items[0] ?? null;
  }

  /**
   * Checks whether at least one document matches the query.
   *
   * @returns `true` when a matching document exists.
   * @throws `QueryError` when Firestore rejects the query.
   */
  async exists(): Promise<boolean> {
    try {
      const snapshot = await this.#query.limit(1).get();
      return snapshot.docs.length > 0;
    } catch (error) {
      throw new QueryError('Firestore exists query failed', error);
    }
  }

  /**
   * Counts the documents matched by the query.
   *
   * Uses Firestore aggregation when available and falls back to reading the
   * document set for test doubles or older clients.
   *
   * @returns The number of matching documents.
   */
  async count(): Promise<number> {
    const aggregate = this.#query as Query<T> & {
      count?: () => { get: () => Promise<{ data: () => { count: number } }> };
    };
    if (typeof aggregate.count === 'function') {
      try {
        const snapshot = await aggregate.count().get();
        return snapshot.data().count;
      } catch (error) {
        throw new QueryError('Firestore count query failed', error);
      }
    }
    return (await this.get()).length;
  }

  /**
   * Fetches a page and returns a cursor for the next one.
   *
   * @param options - Page size or pagination options.
   * @returns The page items, whether more results exist, and the next cursor.
   */
  async paginate(
    options: number | PaginationOptions = {},
  ): Promise<Page<T>> {
    const { limit = 20, startAfter } =
      typeof options === 'number' ? { limit: options } : options;
    if (!Number.isInteger(limit) || limit < 1)
      throw new QueryError('Pagination limit must be a positive integer');

    let query = this.#query.limit(limit + 1);
    if (startAfter !== undefined)
      query = query.startAfter(
        startAfter as Parameters<Query<T>['startAfter']>[0],
      );

    let snapshot;
    try {
      snapshot = await query.get();
    } catch (error) {
      throw new QueryError('Firestore pagination query failed', error);
    }

    const hasMore = snapshot.docs.length > limit;
    const docs = snapshot.docs.slice(0, limit);
    return {
      items: docs.map((doc) => doc.data()),
      nextCursor: hasMore ? (docs[docs.length - 1] as DocumentSnapshot<T>) : undefined,
      hasMore,
    };
  }
}
