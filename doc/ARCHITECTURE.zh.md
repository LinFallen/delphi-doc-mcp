# Delphi Doc MCP 架构设计

本文档描述 Delphi Doc MCP 的实际实现架构。

## 系统概述

Delphi Doc MCP 是一个 Model Context Protocol (MCP) 服务器，为 AI 编程助手提供 Delphi 相关文档的结构化访问能力。

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                       MCP Client                            │
│                   (Claude Desktop 等)                        │
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
│  - 全文索引 (类名、成员名、描述)                               │
│  - 通配符搜索 (*, ?)                                          │
│  - 模糊匹配                                                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    docs/ (JSON 存储)                          │
│  ├── devexpress/         # DevExpress VCL 文档               │
│  │   └── cxGrid/TcxGrid.json                                 │
│  └── fpc/                # Free Pascal RTL 文档              │
│      └── Classes/TComponent.json                             │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ 爬取 & 解析
┌─────────────────────────┴───────────────────────────────────┐
│                      Crawlers                                │
│  ┌───────────────────┬──────────────────┬─────────────────┐ │
│  │ DevExpressCrawler │   FpcCrawler     │   VclCrawler    │ │
│  │   (axios/cheerio) │ (axios/cheerio)  │  (puppeteer)    │ │
│  │        ✅         │       ✅         │   ⚠️ Blocked    │ │
│  └───────────────────┴──────────────────┴─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 核心模块

### 1. 数据模型 (`src/model/types.ts`)

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

### 2. 爬虫模块 (`src/crawler/`)

| 爬虫 | 数据源 | 技术 | 状态 |
|------|--------|------|------|
| `DevExpressCrawler` | docs.devexpress.com/VCL | axios + cheerio | ✅ 可用 |
| `FpcCrawler` | freepascal.org/docs-html/rtl | axios + cheerio | ✅ 可用 |
| `VclCrawler` | docwiki.embarcadero.com | puppeteer | ⚠️ Cloudflare 阻止 |

**特性:**
- 本地 HTML 缓存 (`.cache/html/`)
- 重试机制 (3 次)
- 请求间隔 (1-2 秒)

### 3. 解析器模块 (`src/parser/`)

- `DevExpressParser` - 解析 DevExpress VCL 文档 HTML
- `FpcParser` - 解析 Free Pascal RTL 文档 HTML
- `VclParser` - 解析 Embarcadero DocWiki HTML

### 4. 索引模块 (`src/indexer/lunr-indexer.ts`)

基于 Lunr.js 的全文搜索索引:

- **索引字段**: 类名 (boost: 10), 单元名 (boost: 5), 描述 (boost: 2), 成员名 (boost: 3)
- **搜索功能**: 精确匹配、前缀匹配、后缀匹配、模糊匹配
- **作用域过滤**: 按 source 和 unit 筛选

### 5. MCP 服务器 (`src/server/mcp-server.ts`)

**工具接口:**

| 工具 | 参数 | 功能 |
|------|------|------|
| `discover_units` | query?, source?, page?, pageSize? | 浏览文档单元 |
| `choose_unit` | source, unit? | 设置当前上下文 |
| `current_unit` | - | 显示当前上下文 |
| `search_symbols` | query, maxResults? | 搜索符号 |
| `get_documentation` | symbol | 获取完整文档 |
| `get_version` | - | 服务器版本 |

## 数据流

```
1. 爬取阶段:
   网页 HTML → Crawler → Parser → JSON 文件 (docs/)

2. 运行时:
   用户查询 → MCP Server → Lunr Indexer → JSON 文件 → Markdown 响应
```

## 文件结构

```
Delphi-Doc-Mcp/
├── src/
│   ├── index.ts                 # 入口
│   ├── model/
│   │   └── types.ts             # 数据类型
│   ├── crawler/
│   │   ├── base-crawler.ts      # 基类 (缓存、重试)
│   │   ├── devexpress-crawler.ts
│   │   ├── fpc-crawler.ts
│   │   ├── vcl-crawler.ts
│   │   └── run-*.ts             # CLI 脚本
│   ├── parser/
│   │   ├── devexpress-parser.ts
│   │   ├── fpc-parser.ts
│   │   └── vcl-parser.ts
│   ├── indexer/
│   │   └── lunr-indexer.ts
│   └── server/
│       └── mcp-server.ts
├── docs/                         # 爬取的文档 (JSON)
├── .cache/                       # HTML 缓存
├── dist/                         # 编译输出
├── package.json
└── tsconfig.json
```

## 技术栈

- **运行时**: Node.js 18+
- **语言**: TypeScript (ES Modules)
- **HTTP**: axios
- **HTML 解析**: cheerio
- **浏览器自动化**: puppeteer
- **全文搜索**: lunr.js
- **MCP SDK**: @modelcontextprotocol/sdk

## 使用说明

```bash
# 1. 安装依赖
npm install

# 2. 爬取文档
npm run crawl:devexpress   # DevExpress VCL
npm run crawl:fpc          # Free Pascal RTL

# 3. 构建
npm run build

# 4. 配置 Claude Desktop，添加服务器

# 5. 在 Claude 中使用
#    "查找 TcxGrid 的文档"
```

## 扩展性

添加新数据源只需:
1. 创建新的 Crawler 类继承 `BaseCrawler`
2. 创建对应的 Parser 类
3. 在 `lunr-indexer.ts` 添加数据源加载
4. 更新类型定义中的 `DocSource`