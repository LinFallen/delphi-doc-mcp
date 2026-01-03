/**
 * Delphi Doc MCP - MCP Server Implementation
 * 
 * Model Context Protocol server for Delphi documentation access
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { LunrIndexer } from '../indexer/lunr-indexer.js';
import { ClassDoc, DocSource, CurrentContext } from '../model/types.js';
import { AutoCrawler, getDefaultDirs } from './auto-crawler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use user home directory for data storage
const { docsDir: DOCS_DIR, cacheDir: CACHE_DIR } = getDefaultDirs();

// MCP 工具定义
const TOOLS: Tool[] = [
    {
        name: 'discover_units',
        description: 'Browse and filter available documentation units/libraries. Use this to explore what\'s available before selecting a specific unit.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Optional keyword to filter units',
                },
                source: {
                    type: 'string',
                    enum: ['vcl', 'devexpress'],
                    description: 'Filter by documentation source',
                },
                page: {
                    type: 'number',
                    description: 'Page number (default: 1)',
                },
                pageSize: {
                    type: 'number',
                    description: 'Items per page (default: 20, max: 50)',
                },
            },
        },
    },
    {
        name: 'choose_unit',
        description: 'Select a documentation source and unit to scope subsequent searches. Required before using search_symbols.',
        inputSchema: {
            type: 'object',
            properties: {
                source: {
                    type: 'string',
                    enum: ['vcl', 'devexpress'],
                    description: 'Documentation source',
                },
                unit: {
                    type: 'string',
                    description: 'Unit name (e.g., "cxGrid", "Vcl.Forms")',
                },
            },
            required: ['source'],
        },
    },
    {
        name: 'current_unit',
        description: 'Show the currently selected documentation context and available next steps.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'search_symbols',
        description: 'Search for classes, methods, properties within the active documentation context. Supports wildcards (* for any characters, ? for single character) and fuzzy matching.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query (e.g., "TcxGrid", "Grid*", "*Button")',
                },
                maxResults: {
                    type: 'number',
                    description: 'Maximum results to return (default: 20)',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_documentation',
        description: 'Get detailed documentation for a specific symbol. Returns full class documentation with members.',
        inputSchema: {
            type: 'object',
            properties: {
                symbol: {
                    type: 'string',
                    description: 'Symbol name (e.g., "TcxGrid", "cxGrid.TcxGrid")',
                },
            },
            required: ['symbol'],
        },
    },
    {
        name: 'get_version',
        description: 'Get the current Delphi Doc MCP server version and statistics.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
];

export class DelphiDocMcpServer {
    private server: Server;
    private indexer: LunrIndexer;
    private currentContext: CurrentContext = {};
    private initialized = false;

    constructor() {
        this.indexer = new LunrIndexer();
        this.server = new Server(
            { name: 'delphi-doc-mcp', version: '1.0.0' },
            { capabilities: { tools: {} } }
        );

        this.setupHandlers();
    }

    private setupHandlers(): void {
        // 列出工具
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: TOOLS,
        }));

        // 处理工具调用
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            await this.ensureInitialized();

            const { name, arguments: args = {} } = request.params;

            try {
                switch (name) {
                    case 'discover_units':
                        return await this.handleDiscoverUnits(args);
                    case 'choose_unit':
                        return await this.handleChooseUnit(args);
                    case 'current_unit':
                        return await this.handleCurrentUnit();
                    case 'search_symbols':
                        return await this.handleSearchSymbols(args);
                    case 'get_documentation':
                        return await this.handleGetDocumentation(args);
                    case 'get_version':
                        return await this.handleGetVersion();
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return {
                    content: [{
                        type: 'text',
                        text: `Error: ${(error as Error).message}`,
                    }],
                    isError: true,
                };
            }
        });
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            // Auto-crawl if docs are missing
            const autoCrawler = new AutoCrawler({
                docsDir: DOCS_DIR,
                cacheDir: CACHE_DIR,
                sources: ['fpc', 'devexpress'],
            });

            if (await autoCrawler.needsCrawl()) {
                await autoCrawler.crawl((msg) => console.error(msg));
            }

            console.error('Building index...');
            await this.indexer.buildIndex(DOCS_DIR);
            this.initialized = true;
            console.error('Index ready');
        }
    }

    private async handleDiscoverUnits(args: Record<string, unknown> = {}): Promise<{ content: { type: string; text: string }[] }> {
        const { query, source, page = 1, pageSize = 20 } = args as {
            query?: string;
            source?: DocSource;
            page?: number;
            pageSize?: number;
        };

        let units = this.indexer.getUnits(source);

        // 过滤
        if (query) {
            const queryLower = query.toLowerCase();
            units = units.filter(u => u.unit.toLowerCase().includes(queryLower));
        }

        // 分页
        const effectivePageSize = Math.min(pageSize, 50);
        const start = (page - 1) * effectivePageSize;
        const end = start + effectivePageSize;
        const pageUnits = units.slice(start, end);

        if (pageUnits.length === 0) {
            return {
                content: [{
                    type: 'text',
                    text: units.length === 0
                        ? 'No documentation units found. Run the crawler first to populate the documentation.'
                        : `No units found matching "${query}". Try a different search term.`,
                }],
            };
        }

        let text = `## Available Documentation Units\n\n`;
        text += `Showing ${start + 1}-${Math.min(end, units.length)} of ${units.length} units\n\n`;

        for (const u of pageUnits) {
            text += `- **${u.unit}** (${u.source})\n`;
        }

        text += `\n### Next Steps\n`;
        text += `Use \`choose_unit\` to select a unit, e.g.:\n`;
        text += `\`\`\`json\n{"source": "${pageUnits[0].source}", "unit": "${pageUnits[0].unit}"}\n\`\`\``;

        if (end < units.length) {
            text += `\n\nMore results available. Use \`page: ${page + 1}\` to see more.`;
        }

        return { content: [{ type: 'text', text }] };
    }

    private async handleChooseUnit(args: Record<string, unknown>): Promise<{ content: { type: string; text: string }[] }> {
        const { source, unit } = args as { source: DocSource; unit?: string };

        this.currentContext = { source, unit };

        let text = `## Context Selected\n\n`;
        text += `- **Source:** ${source}\n`;
        if (unit) {
            text += `- **Unit:** ${unit}\n`;
        }

        text += `\n### Next Steps\n`;
        text += `- Use \`search_symbols\` to search within this context\n`;
        text += `- Use \`get_documentation\` to get docs for a specific class\n`;
        text += `- Use \`current_unit\` to see the current selection`;

        return { content: [{ type: 'text', text }] };
    }

    private async handleCurrentUnit(): Promise<{ content: { type: string; text: string }[] }> {
        if (!this.currentContext.source) {
            return {
                content: [{
                    type: 'text',
                    text: '## No Context Selected\n\nUse `discover_units` to browse available documentation, then `choose_unit` to select one.',
                }],
            };
        }

        let text = `## Current Context\n\n`;
        text += `- **Source:** ${this.currentContext.source}\n`;
        if (this.currentContext.unit) {
            text += `- **Unit:** ${this.currentContext.unit}\n`;
        }

        text += `\n### Available Actions\n`;
        text += `- \`search_symbols { "query": "..." }\` - Search within this context\n`;
        text += `- \`get_documentation { "symbol": "TClassName" }\` - Get class documentation\n`;
        text += `- \`choose_unit { ... }\` - Change context`;

        return { content: [{ type: 'text', text }] };
    }

    private async handleSearchSymbols(args: Record<string, unknown>): Promise<{ content: { type: string; text: string }[] }> {
        const { query, maxResults = 20 } = args as { query: string; maxResults?: number };

        if (!query) {
            return {
                content: [{
                    type: 'text',
                    text: 'Error: Query is required. Example: `search_symbols { "query": "Grid" }`',
                }],
                isError: true,
            } as any;
        }

        const results = this.indexer.search(query, {
            source: this.currentContext.source,
            unit: this.currentContext.unit,
            maxResults,
        });

        if (results.length === 0) {
            let text = `## No Results\n\n`;
            text += `No symbols found matching "${query}".\n\n`;
            text += `### Suggestions\n`;
            text += `- Try a broader search term\n`;
            text += `- Use wildcards: \`${query}*\` or \`*${query}*\`\n`;
            if (this.currentContext.unit) {
                text += `- Remove unit filter: \`choose_unit { "source": "${this.currentContext.source}" }\``;
            }

            return { content: [{ type: 'text', text }] };
        }

        let text = `## Search Results for "${query}"\n\n`;
        text += `Found ${results.length} result(s)\n\n`;

        for (const r of results) {
            text += `### ${r.className}\n`;
            text += `- **Unit:** ${r.unit} (${r.source})\n`;
            text += `- **Description:** ${r.description || 'No description'}\n\n`;
        }

        text += `### Next Steps\n`;
        text += `Use \`get_documentation\` to view full documentation:\n`;
        text += `\`\`\`json\n{"symbol": "${results[0].className}"}\n\`\`\``;

        return { content: [{ type: 'text', text }] };
    }

    private async handleGetDocumentation(args: Record<string, unknown>): Promise<{ content: { type: string; text: string }[] }> {
        const { symbol } = args as { symbol: string };

        if (!symbol) {
            return {
                content: [{
                    type: 'text',
                    text: 'Error: Symbol is required. Example: `get_documentation { "symbol": "TcxGrid" }`',
                }],
                isError: true,
            } as any;
        }

        // 解析 symbol: "unit.ClassName" 或 "ClassName"
        const parts = symbol.split('.');
        const className = parts.pop()!;
        const unit = parts.join('.') || this.currentContext.unit || '';
        const source = this.currentContext.source || 'devexpress';

        const doc = this.indexer.getDocument(source, unit, className);

        if (!doc) {
            return {
                content: [{
                    type: 'text',
                    text: `## Symbol Not Found\n\nCould not find documentation for "${symbol}".\n\n### Suggestions\n- Check the spelling\n- Use \`search_symbols\` to find the correct name\n- Make sure the documentation has been crawled`,
                }],
            };
        }

        const markdown = this.formatDocAsMarkdown(doc);
        return { content: [{ type: 'text', text: markdown }] };
    }

    private formatDocAsMarkdown(doc: ClassDoc): string {
        let md = `# ${doc.name}\n\n`;
        md += `**Source:** ${doc.source} | **Unit:** ${doc.unit}\n\n`;

        if (doc.declaration) {
            md += `## Declaration\n\n\`\`\`delphi\n${doc.declaration}\n\`\`\`\n\n`;
        }

        if (doc.description) {
            md += `## Description\n\n${doc.description}\n\n`;
        }

        if (doc.inheritance?.length) {
            md += `## Inheritance\n\n`;
            md += doc.inheritance.join(' → ') + '\n\n';
        }

        if (doc.members.constructors?.length) {
            md += `## Constructors\n\n`;
            for (const m of doc.members.constructors) {
                md += `- **${m.name}**${m.params ? `(${m.params})` : ''}: ${m.description || 'No description'}\n`;
            }
            md += '\n';
        }

        if (doc.members.properties?.length) {
            md += `## Properties\n\n`;
            for (const p of doc.members.properties) {
                md += `- **${p.name}**${p.type ? `: ${p.type}` : ''}: ${p.description || 'No description'}\n`;
            }
            md += '\n';
        }

        if (doc.members.methods?.length) {
            md += `## Methods\n\n`;
            for (const m of doc.members.methods) {
                md += `- **${m.name}**${m.params ? `(${m.params})` : ''}: ${m.description || 'No description'}\n`;
            }
            md += '\n';
        }

        if (doc.members.events?.length) {
            md += `## Events\n\n`;
            for (const e of doc.members.events) {
                md += `- **${e.name}**: ${e.description || 'No description'}\n`;
            }
            md += '\n';
        }

        if (doc.members.fields?.length) {
            md += `## Fields\n\n`;
            for (const f of doc.members.fields) {
                md += `- **${f.name}**${f.type ? `: ${f.type}` : ''}: ${f.description || 'No description'}\n`;
            }
            md += '\n';
        }

        if (doc.url) {
            md += `---\n\n[View original documentation](${doc.url})\n`;
        }

        return md;
    }

    private async handleGetVersion(): Promise<{ content: { type: string; text: string }[] }> {
        const stats = this.indexer.getStats();

        let text = `## Delphi Doc MCP\n\n`;
        text += `**Version:** 1.0.0\n\n`;
        text += `### Statistics\n\n`;
        text += `- **Total Documents:** ${stats.totalDocuments}\n`;

        for (const [source, count] of Object.entries(stats.sources)) {
            text += `- **${source}:** ${count} classes\n`;
        }

        if (stats.totalDocuments === 0) {
            text += `\n> ⚠️ No documentation loaded. Run the crawler to populate:\n`;
            text += `> \`npm run crawl:devexpress\``;
        }

        return { content: [{ type: 'text', text }] };
    }

    async start(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Delphi Doc MCP Server started');
    }
}
