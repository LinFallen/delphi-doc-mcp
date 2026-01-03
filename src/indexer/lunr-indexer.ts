/**
 * Delphi Doc MCP - Lunr Indexer
 * 
 * Full-text search index using Lunr.js with wildcard and fuzzy support
 */

import lunr from 'lunr';
import fs from 'fs-extra';
import path from 'path';
import { ClassDoc, DocSource, SearchResult, IndexDocument } from '../model/types.js';

export class LunrIndexer {
    private index: lunr.Index | null = null;
    private documents: Map<string, ClassDoc> = new Map();
    private units: Map<string, Set<string>> = new Map(); // source -> unit names

    /**
     * 构建索引
     */
    async buildIndex(docsDir: string): Promise<void> {
        const docs: ClassDoc[] = [];

        // 遍历所有 JSON 文件
        const sources: DocSource[] = ['vcl', 'devexpress'];
        for (const source of sources) {
            const sourceDir = path.join(docsDir, source);
            if (await fs.pathExists(sourceDir)) {
                await this.loadDocs(sourceDir, docs, source);
            }
        }

        console.log(`Loaded ${docs.length} documents for indexing`);

        // 存储文档和单元信息
        for (const doc of docs) {
            const key = this.getDocKey(doc);
            this.documents.set(key, doc);

            // 记录单元
            if (!this.units.has(doc.source)) {
                this.units.set(doc.source, new Set());
            }
            this.units.get(doc.source)!.add(doc.unit);
        }

        // 构建 Lunr 索引
        const self = this;
        this.index = lunr(function () {
            this.ref('id');
            this.field('name', { boost: 10 });
            this.field('unit', { boost: 5 });
            this.field('description', { boost: 2 });
            this.field('members', { boost: 3 });

            // 启用通配符和模糊搜索的 pipeline 调整
            this.pipeline.remove(lunr.stemmer);
            this.searchPipeline.remove(lunr.stemmer);

            for (const doc of docs) {
                const memberNames = self.collectMemberNames(doc);

                this.add({
                    id: self.getDocKey(doc),
                    name: doc.name,
                    unit: doc.unit,
                    description: doc.description,
                    members: memberNames,
                });
            }
        });

        console.log('Index built successfully');
    }

    /**
     * 加载文档
     */
    private async loadDocs(dir: string, docs: ClassDoc[], source: DocSource): Promise<void> {
        const items = await fs.readdir(dir);

        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stat = await fs.stat(itemPath);

            if (stat.isDirectory()) {
                await this.loadDocs(itemPath, docs, source);
            } else if (item.endsWith('.json')) {
                try {
                    const doc: ClassDoc = await fs.readJson(itemPath);
                    doc.source = source; // 确保来源正确
                    docs.push(doc);
                } catch (error) {
                    console.error(`Failed to load ${itemPath}: ${(error as Error).message}`);
                }
            }
        }
    }

    /**
     * 收集成员名称
     */
    private collectMemberNames(doc: ClassDoc): string {
        const names: string[] = [];

        if (doc.members) {
            for (const category of Object.values(doc.members)) {
                if (Array.isArray(category)) {
                    for (const member of category) {
                        names.push(member.name);
                    }
                }
            }
        }

        return names.join(' ');
    }

    /**
     * 获取文档键
     */
    private getDocKey(doc: ClassDoc): string {
        return `${doc.source}:${doc.unit}.${doc.name}`;
    }

    /**
     * 搜索
     */
    search(query: string, options?: { source?: DocSource; unit?: string; maxResults?: number }): SearchResult[] {
        if (!this.index) {
            throw new Error('Index not built. Call buildIndex() first.');
        }

        const maxResults = options?.maxResults ?? 20;

        // 构建搜索查询
        let searchQuery = this.buildSearchQuery(query);

        try {
            const results = this.index.search(searchQuery);

            return results
                .filter(r => {
                    const doc = this.documents.get(r.ref);
                    if (!doc) return false;
                    if (options?.source && doc.source !== options.source) return false;
                    if (options?.unit && doc.unit !== options.unit) return false;
                    return true;
                })
                .slice(0, maxResults)
                .map(r => {
                    const doc = this.documents.get(r.ref)!;
                    return {
                        type: 'class' as const,
                        source: doc.source,
                        unit: doc.unit,
                        className: doc.name,
                        description: doc.description.substring(0, 200),
                        score: r.score,
                    };
                });
        } catch (error) {
            // Lunr 查询语法错误时回退到简单搜索
            console.warn(`Search query error: ${(error as Error).message}, falling back to simple search`);
            return this.simpleSearch(query, options);
        }
    }

    /**
     * 构建搜索查询
     */
    private buildSearchQuery(query: string): string {
        // 如果包含通配符，直接使用
        if (query.includes('*') || query.includes('?')) {
            return query;
        }

        // 拆分多个词
        const terms = query.trim().split(/\s+/).filter(t => t.length > 0);

        if (terms.length === 1) {
            // 单词搜索：精确 + 前缀 + 模糊
            const term = terms[0];
            return `${term}^10 ${term}*^5 ${term}~1`;
        }

        // 多词搜索
        return terms.map(t => `+${t}*`).join(' ');
    }

    /**
     * 简单搜索（用于回退）
     */
    private simpleSearch(query: string, options?: { source?: DocSource; unit?: string; maxResults?: number }): SearchResult[] {
        const results: SearchResult[] = [];
        const queryLower = query.toLowerCase();
        const maxResults = options?.maxResults ?? 20;

        for (const doc of this.documents.values()) {
            if (options?.source && doc.source !== options.source) continue;
            if (options?.unit && doc.unit !== options.unit) continue;

            const nameLower = doc.name.toLowerCase();
            let score = 0;

            if (nameLower === queryLower) {
                score = 100;
            } else if (nameLower.startsWith(queryLower)) {
                score = 50;
            } else if (nameLower.includes(queryLower)) {
                score = 25;
            } else if (doc.description.toLowerCase().includes(queryLower)) {
                score = 10;
            }

            if (score > 0) {
                results.push({
                    type: 'class',
                    source: doc.source,
                    unit: doc.unit,
                    className: doc.name,
                    description: doc.description.substring(0, 200),
                    score,
                });
            }
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults);
    }

    /**
     * 获取文档
     */
    getDocument(source: DocSource, unit: string, name: string): ClassDoc | undefined {
        // 先尝试精确匹配
        let doc = this.documents.get(`${source}:${unit}.${name}`);
        if (doc) return doc;

        // 尝试只按类名匹配
        for (const [key, value] of this.documents) {
            if (value.name === name && (!source || value.source === source)) {
                return value;
            }
        }

        return undefined;
    }

    /**
     * 获取所有单元
     */
    getUnits(source?: DocSource): { source: DocSource; unit: string }[] {
        const result: { source: DocSource; unit: string }[] = [];

        for (const [src, units] of this.units) {
            if (!source || src === source) {
                for (const unit of units) {
                    result.push({ source: src as DocSource, unit });
                }
            }
        }

        return result.sort((a, b) => {
            if (a.source !== b.source) return a.source.localeCompare(b.source);
            return a.unit.localeCompare(b.unit);
        });
    }

    /**
     * 获取统计信息
     */
    getStats(): { totalDocuments: number; sources: { [key: string]: number } } {
        const sources: { [key: string]: number } = {};

        for (const doc of this.documents.values()) {
            sources[doc.source] = (sources[doc.source] || 0) + 1;
        }

        return {
            totalDocuments: this.documents.size,
            sources,
        };
    }
}
