# MCP server

The repository includes a read-only Model Context Protocol (MCP) server that
exposes this documentation to any MCP-compatible AI agent. It uses stdio, has
no runtime dependencies, and only reads files from the repository.

## Start the server

From the repository root:

```bash
pnpm run mcp
# or
node mcp/server.mjs
```

Published packages can also expose the server through the
`fireobject-mcp` executable.

## Tools

| Tool | Description |
| --- | --- |
| `list_docs` | Lists every documentation resource. |
| `read_doc` | Reads a page by name, file name, or URI. |
| `search_docs` | Searches all docs and returns matching snippets. |

Examples an agent can use:

```text
search_docs({ "query": "unique field transaction" })
read_doc({ "name": "queries" })
list_docs({})
```

## Resources

Each documentation page is also exposed as a Markdown resource:

```text
fireobject://docs/readme
fireobject://docs/models
fireobject://docs/crud
fireobject://docs/queries
fireobject://docs/relations
fireobject://docs/unique-fields
fireobject://docs/lifecycle
fireobject://docs/validation-helpers
fireobject://docs/field-values
fireobject://docs/errors
fireobject://docs/troubleshooting
fireobject://docs/development
fireobject://docs/mcp
fireobject://docs/agents
```

New files in `docs/` are discovered automatically, so no server changes are
needed when adding a documentation page.

## OpenCode

Add the server to `opencode.json` or `opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "fireobject-docs": {
      "type": "local",
      "command": ["node", "/absolute/path/to/fireobject/mcp/server.mjs"],
      "enabled": true
    }
  }
}
```

After restarting OpenCode, ask it to use `fireobject-docs`, or add a rule such
as:

```text
When working with fireobject, use the fireobject-docs MCP tools to search the
library documentation before answering.
```

## Claude Desktop and compatible clients

Clients that use the `mcpServers` format can use:

```json
{
  "mcpServers": {
    "fireobject-docs": {
      "command": "node",
      "args": ["/absolute/path/to/fireobject/mcp/server.mjs"]
    }
  }
}
```

## Agent files

For agents that read repository files instead of MCP:

- `AGENTS.md`: repository commands, architecture, and conventions.
- `llms.txt`: compact documentation index.
- `llms-full.txt`: complete documentation in one file.

Regenerate the `llms` files after changing documentation:

```bash
pnpm run docs:llms
```

## Protocol details

The server implements JSON-RPC 2.0 over stdio and supports:

- `initialize`, `ping`, and `notifications/initialized`
- `resources/list` and `resources/read`
- `tools/list` and `tools/call`

It does not access Firestore, the network, or the file system outside this
repository.
