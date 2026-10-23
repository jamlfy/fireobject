export interface FireData {
  values: Map<string, unknown>;
  errors: Map<string, string | null>;
}

export const fireDataMap = new WeakMap<object, FireData>();
