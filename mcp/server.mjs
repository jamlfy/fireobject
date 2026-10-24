#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIRECTORY = path.join(ROOT, 'docs');
const SERVER_INFO = {
  name: 'fireobject-docs',
  version: '0.1.0',
};
const SUPPORTED_PROTOCOL_VERSION = '2025-06-18';

const documentationSummaries = {
  readme: 'Library overview, installation, and quick start.',
  agents: 'Repository guide, commands, architecture, and conventions.',
  crud: 'Static CRUD, saving data, and document ids.',
  development: 'Project scripts, local workflow, build, CI, and releases.',
  errors: 'Error hierarchy and error codes.',
  'field-values': 'Using native Firestore FieldValue sentinels.',
  lifecycle: 'Timestamps, soft deletes, transactions, batches, and bulk writes.',
  mcp: 'Running and configuring the Firestore documentation MCP server.',
  models: 'Models, connectors, fields, validation, field options, and hooks.',
  queries: 'Query builder, composed filters, cursors, and pagination.',
  relations: 'References, eager loading, and subcollections.',
  troubleshooting: 'Common errors and fixes.',
  'unique-fields': 'Atomic unique field reservations.',
  'validation-helpers': 'Built-in validation helpers.',
};

class RpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

let documentsPromise;

function extractTitle(content, fallback) {
  return /^#\s+(.+)$/m.exec(content)?.[1]?.trim() ?? fallback;
}

function createDocument({ name, file, content }) {
  const slug = name.toLowerCase();
  return {
    name,
    slug,
    title: extractTitle(content, name),
    uri: `fireobject://docs/${slug}`,
    file,
    content,
    description:
      documentationSummaries[slug] ?? `Documentation for ${name}.`,
  };
}

async function loadDocuments() {
  if (documentsPromise) return documentsPromise;

  documentsPromise = (async () => {
    const files = (await readdir(DOCS_DIRECTORY))
      .filter((file) => file.endsWith('.md'))
      .sort();
    const docs = await Promise.all(
      files.map(async (file) => {
        const name = file.slice(0, -3);
        const absolute = path.join(DOCS_DIRECTORY, file);
        return createDocument({
          name,
          file: absolute,
          content: await readFile(absolute, 'utf8'),
        });
      }),
    );

    const extras = await Promise.all(
      [
        ['README', path.join(ROOT, 'README.md')],
        ['AGENTS', path.join(ROOT, 'AGENTS.md')],
      ].map(async ([name, file]) =>
        createDocument({
          name,
          file,
          content: await readFile(file, 'utf8'),
        }),
      ),
    );

    return [...extras, ...docs];
  })();

  return documentsPromise;
}

function findDocument(documents, requested) {
  const normalized = String(requested)
    .trim()
    .toLowerCase()
    .replace(/^fireobject:\/\/docs\//, '')
    .replace(/\.md$/, '');
  return documents.find(
    (document) =>
      document.slug === normalized ||
      document.uri.toLowerCase() === String(requested).toLowerCase(),
  );
}

function formatDocumentList(documents) {
  return documents
    .map(
      (document) =>
        `- ${document.slug} - ${document.title} (${document.uri}): ${document.description}`,
    )
    .join('\n');
}

function searchDocuments(documents, query, limit) {
  const terms = String(query)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) throw new Error('query cannot be empty');

  const results = [];
  for (const document of documents) {
    const lower = document.content.toLowerCase();
    if (!terms.every((term) => lower.includes(term))) continue;

    const index = lower.indexOf(terms[0]);
    const lineStart = lower.lastIndexOf('\n', index) + 1;
    const nextLine = lower.indexOf('\n', index);
    const lineEnd = nextLine === -1 ? lower.length : nextLine;
    const line = document.content.slice(lineStart, lineEnd).trim();
    const lineNumber = lower.slice(0, lineStart).split('\n').length;
    const score = terms.reduce(
      (total, term) => total + lower.split(term).length - 1,
      0,
    );

    results.push({ document, line, lineNumber, score });
  }

  return results
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.document.slug.localeCompare(right.document.slug),
    )
    .slice(0, limit);
}

const tools = [
  {
    name: 'list_docs',
    description:
      'List every fireobject documentation resource exposed by this MCP server.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'read_doc',
    description:
      'Read a fireobject documentation page by name, file name, or resource URI.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Document name, for example "queries", "queries.md", or "fireobject://docs/queries".',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_docs',
    description:
      'Search fireobject documentation and return matching pages with line snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text to search for. All whitespace-separated terms must match.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Maximum number of results. Defaults to 5.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
];

async function callTool(name, args) {
  const documents = await loadDocuments();

  switch (name) {
    case 'list_docs':
      return {
        content: [
          {
            type: 'text',
            text: `Available fireobject documentation:\n\n${formatDocumentList(documents)}`,
          },
        ],
      };
    case 'read_doc': {
      const document = findDocument(documents, args.name);
      if (!document)
        throw new Error(
          `Unknown document "${args.name}". Available documents:\n${formatDocumentList(documents)}`,
        );
      return {
        content: [
          {
            type: 'text',
            text: document.content,
          },
        ],
      };
    }
    case 'search_docs': {
      const requestedLimit = Number(args.limit);
      const limit = Number.isInteger(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), 20)
        : 5;
      const results = searchDocuments(documents, args.query, limit);
      if (results.length === 0)
        return {
          content: [
            {
              type: 'text',
              text: `No documentation matched "${args.query}".`,
            },
          ],
        };
      const text = results
        .map(
          (result, index) =>
            `${index + 1}. ${result.document.name} (${result.document.uri}, line ${result.lineNumber})\n   ${result.line}`,
        )
        .join('\n\n');
      return {
        content: [
          {
            type: 'text',
            text: `Matches for "${args.query}":\n\n${text}`,
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown tool "${name}".`);
  }
}

async function handleRequest(method, params) {
  const documents = await loadDocuments();

  switch (method) {
    case 'initialize':
      return {
        protocolVersion:
          typeof params.protocolVersion === 'string'
            ? params.protocolVersion
            : SUPPORTED_PROTOCOL_VERSION,
        capabilities: {
          resources: {},
          tools: {},
        },
        serverInfo: SERVER_INFO,
        instructions:
          'Use search_docs to find fireobject API documentation, read_doc to load a page, and list_docs to browse all resources.',
      };
    case 'notifications/initialized':
      return null;
    case 'ping':
      return {};
    case 'resources/list':
      return {
        resources: documents.map((document) => ({
          uri: document.uri,
          name: document.title,
          description: document.description,
          mimeType: 'text/markdown',
        })),
      };
    case 'resources/read': {
      const document = findDocument(documents, params.uri);
      if (!document)
        throw new RpcError(
          -32002,
          `Resource not found: ${params.uri}`,
        );
      return {
        contents: [
          {
            uri: document.uri,
            mimeType: 'text/markdown',
            text: document.content,
          },
        ],
      };
    }
    case 'tools/list':
      return { tools };
    case 'tools/call': {
      if (typeof params.name !== 'string')
        throw new RpcError(-32602, 'Tool name is required');
      try {
        return await callTool(params.name, params.arguments ?? {});
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        };
      }
    }
    default:
      throw new RpcError(-32601, `Method not found: ${method}`);
  }
}

function success(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function failure(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

async function handleMessage(message) {
  if (
    !message ||
    message.jsonrpc !== '2.0' ||
    typeof message.method !== 'string'
  ) {
    if (message && message.id !== undefined)
      return failure(message.id, -32600, 'Invalid Request');
    return null;
  }

  const isNotification = message.id === undefined;
  try {
    const result = await handleRequest(
      message.method,
      message.params ?? {},
    );
    if (isNotification) return null;
    return success(message.id, result);
  } catch (error) {
    if (isNotification) return null;
    if (error instanceof RpcError)
      return failure(message.id, error.code, error.message, error.data);
    return failure(
      message.id,
      -32603,
      error instanceof Error ? error.message : 'Internal error',
    );
  }
}

async function handleLine(line) {
  if (!line.trim()) return;
  let payload;
  try {
    payload = JSON.parse(line);
  } catch {
    write(failure(null, -32700, 'Parse error'));
    return;
  }

  if (Array.isArray(payload)) {
    const responses = (
      await Promise.all(payload.map((message) => handleMessage(message)))
    ).filter(Boolean);
    if (responses.length > 0) write(responses);
    return;
  }

  const response = await handleMessage(payload);
  if (response) write(response);
}

function write(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const input = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

let queue = Promise.resolve();
input.on('line', (line) => {
  queue = queue
    .then(() => handleLine(line))
    .catch((error) => {
      process.stderr.write(
        `fireobject-docs MCP error: ${
          error instanceof Error ? error.stack ?? error.message : String(error)
        }\n`,
      );
    });
});
