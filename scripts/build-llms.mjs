#!/usr/bin/env node

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIRECTORY = path.join(ROOT, 'docs');

const summaries = {
  crud: 'Static CRUD, saving data, and document ids.',
  development: 'Project scripts, local workflow, build, CI, and releases.',
  errors: 'Error hierarchy and error codes.',
  'field-values': 'Using native Firestore FieldValue sentinels.',
  lifecycle: 'Timestamps, soft deletes, transactions, batches, and bulk writes.',
  mcp: 'Running and configuring the documentation MCP server.',
  models: 'Models, connectors, fields, validation, field options, and hooks.',
  queries: 'Query builder, composed filters, cursors, and pagination.',
  relations: 'References, eager loading, and subcollections.',
  troubleshooting: 'Common errors and fixes.',
  'unique-fields': 'Atomic unique field reservations.',
  'validation-helpers': 'Built-in validation helpers.',
};

const packageJson = JSON.parse(
  await readFile(path.join(ROOT, 'package.json'), 'utf8'),
);
const docs = (await readdir(DOCS_DIRECTORY))
  .filter((file) => file.endsWith('.md'))
  .sort()
  .map((file) => ({
    name: file.slice(0, -3),
    path: `docs/${file}`,
    summary: summaries[file.slice(0, -3)] ?? `Documentation for ${file}`,
  }));

const entries = [
  {
    name: 'README',
    path: 'README.md',
    summary: 'Library overview, installation, and quick start.',
  },
  ...docs,
  {
    name: 'AGENTS',
    path: 'AGENTS.md',
    summary: 'Repository guide for coding agents.',
  },
];

const index = [
  '# fireobject',
  '',
  '> Firestore ORM with typed CRUD, validation, query builder, hooks, unique',
  '> fields, timestamps, soft deletes, references, and subcollections.',
  '',
  `Version ${packageJson.version}. Node.js 18 or newer. Peer dependency:`,
  '`@google-cloud/firestore` (`>=7 <9`).',
  '',
  'This file is a compact index for AI agents. Read `AGENTS.md` for repository',
  'workflows and use the MCP server for searchable documentation.',
  '',
  '## Documentation',
  '',
  ...docs.map((doc) => `- [${doc.name}](./${doc.path}): ${doc.summary}`),
  '',
  '## Agent resources',
  '',
  '- [README](./README.md): Library overview and quick start.',
  '- [AGENTS.md](./AGENTS.md): Commands, architecture, and conventions.',
  '- [Full documentation](./llms-full.txt): All documentation in one file.',
  '- [MCP server](./mcp/server.mjs): Zero-dependency stdio server.',
  '- [MCP setup](./docs/mcp.md): Client configuration and tools.',
  '',
];

const full = [
  '# fireobject - full documentation',
  '',
  `> Version ${packageJson.version}. Generated with \`pnpm run docs:llms\`.`,
  '',
  'This file concatenates the project documentation for AI agents that need a',
  'single context file. The MCP server remains the preferred interface because',
  'it supports search and page-level reads.',
];
for (const entry of entries) {
  const content = await readFile(path.join(ROOT, entry.path), 'utf8');
  full.push('', '---', '', `<!-- Source: ${entry.path} -->`, '', content.trim());
}

await writeFile(path.join(ROOT, 'llms.txt'), `${index.join('\n').trim()}\n`);
await writeFile(
  path.join(ROOT, 'llms-full.txt'),
  `${full.join('\n').trim()}\n`,
);

process.stdout.write(
  `Generated llms.txt and llms-full.txt from ${entries.length} documents.\n`,
);
