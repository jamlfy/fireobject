import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(
  new URL('../../mcp/server.mjs', import.meta.url),
);

let child: ChildProcessWithoutNullStreams;
let output: Interface;
let nextId = 1;
const pending = new Map<
  number,
  {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }
>();

const send = (payload: Record<string, unknown>): void => {
  child.stdin.write(`${JSON.stringify(payload)}\n`);
};

const request = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<any>((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}`));
    }, 5_000);
    pending.set(id, { resolve, reject, timer });
    send({ jsonrpc: '2.0', id, method, params });
  });

beforeAll(async () => {
  child = spawn(process.execPath, [serverPath], { stdio: 'pipe' });
  output = createInterface({ input: child.stdout });
  output.on('line', (line) => {
    const message = JSON.parse(line);
    if (message.id === undefined) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error)
      entry.reject(new Error(`${message.error.code}: ${message.error.message}`));
    else entry.resolve(message.result);
  });

  const initialized = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'fireobject-tests', version: '1.0.0' },
  });
  expect(initialized.serverInfo.name).toBe('fireobject-docs');
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
});

afterAll(() => {
  output?.close();
  child?.kill();
});

describe('MCP documentation server', () => {
  it('lists documentation resources and tools', async () => {
    const resources = await request('resources/list');
    expect(resources.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uri: 'fireobject://docs/queries' }),
        expect.objectContaining({ uri: 'fireobject://docs/readme' }),
      ]),
    );

    const tools = await request('tools/list');
    expect(tools.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'list_docs',
      'read_doc',
      'search_docs',
    ]);
  });

  it('reads a documentation resource', async () => {
    const result = await request('resources/read', {
      uri: 'fireobject://docs/queries',
    });
    expect(result.contents[0].mimeType).toBe('text/markdown');
    expect(result.contents[0].text).toContain('# Queries');
  });

  it('lists and reads docs through tools', async () => {
    const list = await request('tools/call', {
      name: 'list_docs',
      arguments: {},
    });
    expect(list.content[0].text).toContain('Queries');

    const read = await request('tools/call', {
      name: 'read_doc',
      arguments: { name: 'queries.md' },
    });
    expect(read.content[0].text).toContain('Composed filters');
  });

  it('searches documentation and reports unknown pages', async () => {
    const search = await request('tools/call', {
      name: 'search_docs',
      arguments: { query: 'findMany', limit: 5 },
    });
    expect(search.content[0].text).toContain('crud');

    const missing = await request('tools/call', {
      name: 'read_doc',
      arguments: { name: 'missing' },
    });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toContain('Unknown document');
  });
});
