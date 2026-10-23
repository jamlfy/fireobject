/**
 * Removes the final document placeholder from a collection pattern.
 *
 * `Packages/:package/Versions/:version` becomes `Packages/:package/Versions`,
 * while an already-collection pattern is returned unchanged.
 *
 * @param documentPattern - Pattern that may end with a document placeholder.
 * @returns The collection portion of the pattern.
 */
export function collectionPattern(documentPattern: string): string {
  const segments = documentPattern.split('/');
  return segments[segments.length - 1]?.startsWith(':')
    ? segments.slice(0, -1).join('/')
    : documentPattern;
}

/**
 * Expands a nested `parent` path into individual placeholder values.
 *
 * For example, a pattern like
 * `Packages/:parent/Versions/:version/Certifications/:certification` receives
 * `parent = "Packages/demo/Versions/1.0.0"` and fills `version` with
 * `1.0.0`.
 *
 * @param pattern - Full collection pattern.
 * @param params - Caller-supplied path parameters.
 * @returns A new params object with placeholders extracted from `parent`.
 */
function expandPathParams(
  pattern: string,
  params: Record<string, string>,
): Record<string, string> {
  const expanded = { ...params };
  const parentPath = params['parent'];
  if (!parentPath?.includes('/')) return expanded;

  const patternSegments = pattern.split('/');
  parentPath.split('/').forEach((segment, index) => {
    const patternSegment = patternSegments[index];
    if (patternSegment?.startsWith(':')) {
      expanded[patternSegment.slice(1)] = segment;
    }
  });
  return expanded;
}

/**
 * Replaces `:param` placeholders in a collection pattern with actual values.
 *
 * @param pattern - Collection pattern containing placeholders.
 * @param params - Values for every placeholder.
 * @returns The resolved collection path.
 * @throws If any placeholder has no value.
 */
export function fillCollectionPattern(
  pattern: string,
  params: Record<string, string>,
): string {
  const expanded = expandPathParams(pattern, params);
  return collectionPattern(pattern).replace(
    /:([A-Za-z_][A-Za-z0-9_]*)/g,
    (_, key: string) => {
      const value = expanded[key];
      if (!value)
        throw new Error(`Missing param "${key}" for path "${pattern}"`);
      return value;
    },
  );
}

/**
 * Builds path parameters from a model instance.
 *
 * The last placeholder is treated as the document id. Earlier placeholders are
 * read from same-named instance properties, which supports nested collections
 * such as `Packages/:package/Versions/:version`.
 *
 * @param pattern - Collection pattern used by the model.
 * @param instance - Model instance containing the document id and parent keys.
 * @returns Path parameters available on the instance.
 */
export function instancePathParams(
  pattern: string,
  instance: object & { id: string },
): Record<string, string> {
  const placeholders = [...pattern.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map(
    ([, key]) => key,
  );
  const finalPlaceholder = placeholders[placeholders.length - 1];

  return Object.fromEntries(
    placeholders.flatMap((key) => {
      const value =
        key === finalPlaceholder ? instance.id : Reflect.get(instance, key);
      return value ? [[key, String(value)]] : [];
    }),
  );
}
