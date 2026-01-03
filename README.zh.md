# Delphi Doc MCP

[English](./README.md)

一个 **Model Context Protocol (MCP)** 服务器，为 AI 编程助手提供 Delphi 文档访问能力。

## ✨ 功能特点

- 📚 **多数据源支持** - DevExpress VCL + Free Pascal RTL (与 Delphi VCL 兼容)
- 🔍 **智能搜索** - 全文搜索，支持通配符 (`*`, `?`) 和模糊匹配
- ⚡ **快速缓存** - 本地缓存，二次查询即时响应
- 🤖 **AI 友好** - 结构化 Markdown 输出，便于 LLM 理解

## 🚀 快速开始

### 安装

```bash
npm install
npm run build
```

### 配置 MCP 客户端

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "delphi-docs": {
      "command": "node",
      "args": ["/你的路径/Delphi-Doc-Mcp/dist/index.js"]
    }
  }
}
```

### 爬取文档

使用前需要先爬取文档数据：

```bash
# 爬取 DevExpress VCL 文档
npm run crawl:devexpress

# 爬取 Free Pascal RTL (Delphi VCL 替代)
npm run crawl:fpc
```

## 🧰 可用工具

| 工具 | 描述 |
|------|------|
| `discover_units` | 浏览/筛选可用的文档单元 |
| `choose_unit` | 选择当前文档源和单元 |
| `current_unit` | 显示当前选择和下一步操作 |
| `search_symbols` | 搜索类、方法、属性 |
| `get_documentation` | 获取符号的完整文档 |
| `get_version` | 获取服务器版本和统计信息 |

## 🔄 典型工作流

```
1. 浏览 → discover_units { "query": "grid" }
2. 选择 → choose_unit { "source": "devexpress", "unit": "cxGrid" }
3. 搜索 → search_symbols { "query": "TcxGrid*" }
4. 查看 → get_documentation { "symbol": "TcxGrid" }
```

## 🔍 搜索技巧

- **精确匹配**: `TcxGrid`
- **前缀匹配**: `Tcx*`
- **后缀匹配**: `*Grid`
- **包含匹配**: `*Data*`
- **模糊匹配**: 自动启用，容错拼写错误

## 📁 项目结构

```
src/
├── index.ts           # 入口文件
├── model/             # 数据类型定义
├── crawler/           # 文档爬虫
│   ├── devexpress-crawler.ts   # DevExpress 文档
│   ├── fpc-crawler.ts          # Free Pascal RTL
│   └── vcl-crawler.ts          # DocWiki (Cloudflare 阻止)
├── parser/            # HTML 解析器
├── indexer/           # Lunr.js 搜索索引
└── server/            # MCP 服务器
```

## 📊 数据源状态

| 数据源 | 状态 | 命令 |
|--------|------|------|
| DevExpress VCL | ✅ 可用 | `npm run crawl:devexpress` |
| Free Pascal RTL | ✅ 可用 | `npm run crawl:fpc` |
| RAD Studio DocWiki | ⚠️ Cloudflare 保护 | `npm run crawl:vcl` |

> **注意**: DocWiki 使用 Cloudflare 保护，无头浏览器无法访问。Free Pascal RTL 提供与 Delphi VCL 兼容的核心类文档 (TComponent, TList, TStream 等)。

## 🛠️ 开发

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 测试单个类爬取
npm run crawl:devexpress -- --test https://docs.devexpress.com/VCL/cxGrid.TcxGrid
npm run crawl:fpc -- --test https://www.freepascal.org/docs-html/rtl/classes/tcomponent.html

# 生产构建
npm run build

# 运行测试
npm run test
```

## 📝 许可证

MIT
