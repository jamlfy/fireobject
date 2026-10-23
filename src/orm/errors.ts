/** Base class for every error raised by `fireobject`. */
export class FireObjectError extends Error {
  /**
   * @param message - Human-readable error message.
   * @param code - Stable machine-readable error code.
   * @param options - Optional native error options (`cause`).
   */
  constructor(
    message: string,
    public readonly code = 'FIREOBJECT_ERROR',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Error raised when one or more model fields are invalid. */
export class ValidationError extends FireObjectError {
  /**
   * @param message - Human-readable error message.
   * @param errors - Validation errors keyed by field name.
   * @param options - Optional native error options (`cause`).
   */
  constructor(
    message = 'Validation failed',
    public readonly errors: Readonly<Record<string, string | null>> = {},
    options?: ErrorOptions,
  ) {
    super(message, 'VALIDATION_ERROR', options);
  }
}

/** Error raised when a single field fails validation during a save. */
export class FieldValidationError extends ValidationError {
  /**
   * @param field - Field that failed validation.
   * @param message - Validation message.
   */
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message, { [field]: message });
  }
}

/** Error raised when a document cannot be found. */
export class NotFoundError extends FireObjectError {
  /**
   * @param collection - Collection path that was queried.
   * @param id - Document id that was queried.
   */
  constructor(
    public readonly collection: string,
    public readonly id: string,
  ) {
    super(`Document ${collection}/${id} not found`, 'NOT_FOUND');
  }
}

/** Error raised when a write conflicts with an existing document or value. */
export class ConflictError extends FireObjectError {
  /**
   * @param message - Human-readable conflict message.
   * @param field - Optional field that caused the conflict.
   */
  constructor(
    message: string,
    public readonly field?: string,
    options?: ErrorOptions,
  ) {
    super(message, 'CONFLICT', options);
  }
}

/** Error raised when a unique value is already reserved by another document. */
export class UniqueFieldConflictError extends ConflictError {
  /**
   * @param field - Unique field that conflicts.
   */
  constructor(public readonly fieldName: string) {
    super(`${fieldName} is already taken`, fieldName);
    this.name = 'UniqueFieldConflictError';
  }
}

/** Error raised when a Firestore query fails. */
export class QueryError extends FireObjectError {
  /**
   * @param message - Human-readable query error.
   * @param cause - Original Firestore error.
   */
  constructor(
    message: string,
    cause?: unknown,
  ) {
    super(message, 'QUERY_ERROR', { cause });
  }
}

/** Error raised when a transaction cannot be completed. */
export class TransactionError extends FireObjectError {
  /**
   * @param message - Human-readable transaction error.
   * @param cause - Original Firestore error.
   */
  constructor(
    message: string,
    cause?: unknown,
  ) {
    super(message, 'TRANSACTION_ERROR', { cause });
  }
}
