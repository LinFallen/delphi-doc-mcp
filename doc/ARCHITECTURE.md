# Delphi Doc MCP Architecture

This document describes the architecture of the Delphi Doc MCP implementation.

## System Overview

Delphi Doc MCP is a Model Context Protocol (MCP) server that provides AI coding assistants with structured access to Delphi-related documentation.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       MCP Client                            │
│                   (Claude Desktop, etc.)                    │
└─────────────────────────┬───────────────────────────────────┘
                          │ MCP Protocol (stdio)
┌─────────────────────────▼───────────────────────────────────┐
│                    MCP Server                                │
│                  (mcp-server.ts)                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Tools: discover_units | choose_unit | search_symbols │    │
│  │        get_documentation | current_unit | get_version│    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Lunr Indexer                              │
│                  (lunr-indexer.ts)                           │
│  - Full-text indexing (class names, members, descriptions)  │
│  - Wildcard search (*, ?)                                    │
│  - Fuzzy matching                                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    docs/ (JSON Storage)                      │
│  ├── devexpress/         # DevExpress VCL docs              │
│  │   └── cxGrid/TcxGrid.json                                 │
│  └── fpc/                # Free Pascal RTL docs              │
│      └── Classes/TComponent.json                             │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ Crawl & Parse
┌─────────────────────────┴───────────────────────────────────┐
│                      Crawlers                                │
│  ┌───────────────────┬──────────────────┬─────────────────┐ │
│  │ DevExpressCrawler │   FpcCrawler     │   VclCrawler    │ │
│  │   (axios/cheerio) │ (axios/cheerio)  │  (puppeteer)    │ │
│  │        ✅         │       ✅         │   ⚠️ Blocked    │ │
│  └───────────────────┴──────────────────┴─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Modules

### 1. Data Model (`src/model/types.ts`)

```typescript
interface ClassDoc {
  source: 'vcl' | 'devexpress';
  unit: string;           // "cxGrid", "Classes"
  name: string;           // "TcxGrid", "TComponent"
  declaration: string;    // "TcxGrid = class(TcxCustomGrid)"
  inheritance: string[];  // ["TObject", "TPersistent", ...]
  description: string;
  url: string;
  members: {
    constructors?: MemberDoc[];
    properties?: MemberDoc[];
    methods?: MemberDoc[];
    events?: MemberDoc[];
    fields?: MemberDoc[];
  };
}
```

### 2. Crawler Module (`src/crawler/`)

| Crawler | Data Source | Technology | Status |
|---------|-------------|------------|--------|
| `DevExpressCrawler` | docs.devexpress.com/VCL | axios + cheerio | ✅ Available |
| `FpcCrawler` | freepascal.org/docs-html/rtl | axios + cheerio | ✅ Available |
| `VclCrawler` | docwiki.embarcadero.com | puppeteer | ⚠️ Cloudflare blocked |

**Features:**
- Local HTML caching (`.cache/html/`)
- Retry mechanism (3 attempts)
- Request interval (1-2 seconds)

### 3. Parser Module (`src/parser/`)

- `DevExpressParser` - Parses DevExpress VCL documentation HTML
- `FpcParser` - Parses Free Pascal RTL documentation HTML
- `VclParser` - Parses Embarcadero DocWiki HTML

### 4. Indexer Module (`src/indexer/lunr-indexer.ts`)

Full-text search index based on Lunr.js:

- **Index fields**: Class name (boost: 10), Unit name (boost: 5), Description (boost: 2), Member names (boost: 3)
- **Search features**: Exact match, prefix match, suffix match, fuzzy match
- **Scope filtering**: Filter by source and unit

### 5. MCP Server (`src/server/mcp-server.ts`)

**Tool Interfaces:**

| Tool | Parameters | Function |
|------|------------|----------|
| `discover_units` | query?, source?, page?, pageSize? | Browse documentation units |
| `choose_unit` | source, unit? | Set current context |
| `current_unit` | - | Show current context |
| `search_symbols` | query, maxResults? | Search symbols |
| `get_documentation` | symbol | Get full documentation |
| `get_version` | - | Server version |

## Data Flow

```
1. Crawl Phase:
   Web HTML → Crawler → Parser → JSON files (docs/)

2. Runtime:
   User Query → MCP Server → Lunr Indexer → JSON files → Markdown Response
```

## File Structure

```
Delphi-Doc-Mcp/
├── src/
│   ├── index.ts                 # Entry point
│   ├── model/
│   │   └── types.ts             # Data types
│   ├── crawler/
│   │   ├── base-crawler.ts      # Base class (caching, retry)
│   │   ├── devexpress-crawler.ts
│   │   ├── fpc-crawler.ts
│   │   ├── vcl-crawler.ts
│   │   └── run-*.ts             # CLI scripts
│   ├── parser/
│   │   ├── devexpress-parser.ts
│   │   ├── fpc-parser.ts
│   │   └── vcl-parser.ts
│   ├── indexer/
│   │   └── lunr-indexer.ts
│   └── server/
│       └── mcp-server.ts
├── doc/                          # Documentation
├── docs/                         # Crawled docs (JSON)
├── .cache/                       # HTML cache
├── dist/                         # Build output
├── package.json
└── tsconfig.json
```

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript (ES Modules)
- **HTTP**: axios
- **HTML Parsing**: cheerio
- **Browser Automation**: puppeteer
- **Full-text Search**: lunr.js
- **MCP SDK**: @modelcontextprotocol/sdk

## Usage

```bash
# 1. Install dependencies
npm install

# 2. Crawl documentation
npm run crawl:devexpress   # DevExpress VCL
npm run crawl:fpc          # Free Pascal RTL

# 3. Build
npm run build

# 4. Configure Claude Desktop, add server

# 5. Use in Claude
#    "Find documentation for TcxGrid"
```

## Extensibility

To add a new data source:
1. Create a new Crawler class extending `BaseCrawler`
2. Create a corresponding Parser class
3. Add data source loading in `lunr-indexer.ts`
4. Update `DocSource` in type definitions
