# Delphi Doc MCP

[中文版](./README.zh.md)

A **Model Context Protocol (MCP)** server that provides seamless access to Delphi documentation directly within your AI coding assistant.

## Features

- 📚 **Multi-Source Documentation** - Access both RAD Studio VCL and DevExpress VCL documentation
- 🔍 **Smart Search** - Full-text search with wildcard (`*`, `?`) and fuzzy matching support
- ⚡ **Fast & Cached** - Local caching for quick subsequent lookups
- 🤖 **AI-Friendly** - Structured Markdown output optimized for LLM consumption

## Quick Start

### Installation

**From npm (recommended):**
```bash
npm install -g delphi-doc-mcp
```

**From source:**
```bash
git clone https://github.com/LinFallen/delphi-doc-mcp.git
cd delphi-doc-mcp
npm install
npm run build
```

> **Note**: On first run, the server will automatically crawl documentation. This takes a few minutes but only happens once. Data is stored in `~/.delphi-doc-mcp/`.

### Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

**If installed via npm (global):**
```json
{
  "mcpServers": {
    "delphi-docs": {
      "command": "delphi-doc-mcp"
    }
  }
}
```

**If installed from source:**
```json
{
  "mcpServers": {
    "delphi-docs": {
      "command": "node",
      "args": ["/path/to/delphi-doc-mcp/dist/index.js"]
    }
  }
}
```

## 🧰 Available Tools

| Tool | Description |
|------|-------------|
| `discover_units` | Browse/filter available documentation units |
| `choose_unit` | Select active documentation source and unit |
| `current_unit` | Show current selection and next steps |
| `search_symbols` | Search classes, methods, properties |
| `get_documentation` | Get full documentation for a symbol |
| `get_version` | Get server version and statistics |

## 🔄 Typical Workflow

```
1. Explore → discover_units { "query": "grid" }
2. Select → choose_unit { "source": "devexpress", "unit": "cxGrid" }
3. Search → search_symbols { "query": "TcxGrid*" }
4. Read   → get_documentation { "symbol": "TcxGrid" }
```

## Search Tips

- **Exact match**: `TcxGrid`
- **Starts with**: `Tcx*`
- **Ends with**: `*Grid`
- **Contains**: `*Data*`
- **Fuzzy**: Automatically enabled for typo tolerance

## Project Structure

```
src/
├── index.ts           # Entry point
├── model/             # Data types
├── crawler/           # Documentation crawlers
├── parser/            # HTML parsers
├── indexer/           # Search indexing
└── server/            # MCP server
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Test crawling a single class
npm run crawl:devexpress -- --test https://docs.devexpress.com/VCL/cxGrid.TcxGrid

# Build for production
npm run build

# Run tests
npm run test
```

## License

MIT
