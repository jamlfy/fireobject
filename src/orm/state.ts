/**
 * Internal storage for a model instance.
 *
 * Values and validation errors live outside the instance in a `WeakMap` so
 * decorators can expose clean accessors without leaking state onto the model.
 */
export interface FireData {
  /** Current field values keyed by property name. */
  values: Map<string, unknown>;
  /** First validation error per property, or `null` when valid. */
  errors: Map<string, string | null>;
}

/**
 * Per-instance ORM state.
 *
 * A `WeakMap` lets instances be garbage-collected normally and avoids adding
 * enumerable keys to the model.
 */
export const fireDataMap = new WeakMap<object, FireData>();
