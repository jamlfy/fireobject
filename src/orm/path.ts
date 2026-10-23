export function collectionPattern(documentPattern: string): string {
  const segments = documentPattern.split('/');
  return segments[segments.length - 1]?.startsWith(':')
    ? segments.slice(0, -1).join('/')
    : documentPattern;
}

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
