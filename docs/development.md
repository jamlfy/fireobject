# Development

## Project scripts

```bash
pnpm install          # install dependencies
pnpm run typecheck    # TypeScript type checking (tsc --noEmit)
pnpm run test         # run the Vitest suite once
pnpm run test:watch   # run tests in watch mode
pnpm run build        # build ESM, CommonJS, and declarations with tsup
pnpm run dev          # rebuild on changes
npm pack --dry-run    # inspect the files that would be published
```

`prepublishOnly` runs `typecheck`, `test`, and `build` automatically before a
manual `npm publish`.

---

## Development

### Install dependencies

```bash
pnpm install
```

The repository includes a `pnpm-lock.yaml`. CI uses:

```bash
pnpm install --frozen-lockfile
```

### Run checks locally

```bash
pnpm run typecheck
pnpm run test
pnpm run build
npm pack --dry-run
```

### Test with the Firestore emulator

Install and start the emulator, then point your app or tests at it:

```bash
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

The library itself does not start the emulator. The consuming application is
responsible for configuring Firestore.

### Build output

```text
dist/
├── index.js          # ESM
├── index.cjs         # CommonJS
├── index.d.ts        # ESM types
├── index.d.cts       # CommonJS types
└── orm/
    └── ...           # subpath build for `fireobject/orm`
```

`package.json` exposes both entry points:

```typescript
import { FireObject } from 'fireobject';
// or
import { FireObject } from 'fireobject/orm';
```

### How the package selects JS or TypeScript

The published package contains compiled JavaScript and the original TypeScript
sources. The consumer's tool decides which entry to use through the standard
`package.json` conditions:

| Consumer | `package.json` field/condition | File |
| --- | --- | --- |
| Node.js ESM | `exports["."].import` | `dist/index.js` |
| Node.js CommonJS | `exports["."].require` | `dist/index.cjs` |
| TypeScript ESM | `exports["."].import.types` | `dist/index.d.ts` |
| TypeScript CommonJS | `exports["."].require.types` | `dist/index.d.cts` |
| Bundlers with `source` support | top-level `source` | `src/index.ts` |
| TypeScript versions without `exports` support | `typesVersions` | `dist/index.d.ts` |

Node.js never executes TypeScript directly. TypeScript reads the declaration
files during type checking, while the runtime loads the compiled `.js` or
`.cjs` file. The `src` directory is included so source maps and bundlers that
understand the `source` field can work with the original `.ts` code.

The same conditions are available for the `fireobject/orm` subpath.

### Type checking and decorators

The package compiles with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

Consumers must also enable `experimentalDecorators` for their own models.

---

## Publishing a release

Publishing is automated by `.github/workflows/publish.yml`.

### One-time setup

1. Create an npm automation token with publish access.
2. Add it to the GitHub repository as the `NPM_TOKEN` secret.
3. Ensure the package name is available on npm. This package uses
   `fireobject`.

### Release flow

1. Update the version in `package.json`:

   ```bash
   pnpm version patch
   # or: pnpm version minor
   # or: pnpm version major
   ```

2. Push the commit and the tag:

   ```bash
   git push origin main
   git push origin v0.1.1
   ```

3. The publish workflow will:
   - Check out the tag.
   - Install dependencies with a frozen lockfile.
   - Verify that the tag matches `package.json` (for example, `v0.1.1` must
     match `"version": "0.1.1"`).
   - Run type checking, tests, and the build.
   - Publish to npm.
   - Create a GitHub Release and attach the packed `.tgz`.

If the tag and the package version do not match, the workflow fails before
publishing.

### CI

`.github/workflows/ci.yml` runs on every push to `main`, every pull request, and
manually. It tests Node.js 20, 22, and 24 and runs:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test
pnpm run build
npm pack --dry-run
```

### Manual publish

```bash
pnpm run typecheck
pnpm run test
pnpm run build
npm publish --access public
```

`prepublishOnly` repeats the checks before a manual publish.
