/**
 * Delphi Doc MCP - DevExpress Crawler
 * 
 * Crawl DevExpress VCL documentation from docs.devexpress.com
 */

import { BaseCrawler } from './base-crawler.js';
import { DevExpressParser } from '../parser/devexpress-parser.js';
import { ClassDoc, CrawlerConfig } from '../model/types.js';

export class DevExpressCrawler extends BaseCrawler {
    private parser: DevExpressParser;
    private readonly baseUrl = 'https://docs.devexpress.com/VCL';

    constructor(config: CrawlerConfig) {
        super(config);
        this.parser = new DevExpressParser();
    }

    /**
     * 执行完整爬取
     */
    async crawl(): Promise<void> {
        console.log('Starting DevExpress VCL documentation crawl...');

        // 1. 获取控件库列表
        const libraries = await this.getLibraries();
        console.log(`Found ${libraries.length} libraries`);

        // 2. 遍历每个库获取类列表
        for (const lib of libraries) {
            console.log(`\nProcessing library: ${lib.name}`);

            try {
                const classes = await this.getClassList(lib.url);
                console.log(`  Found ${classes.length} classes`);

                // 3. 爬取每个类的文档
                for (const cls of classes) {
                    try {
                        const doc = await this.crawlClass(cls.url, lib.name);
                        if (doc.name && doc.description) {
                            await this.saveDoc(doc, `devexpress/${doc.unit}`, doc.name);
                        }
                    } catch (error) {
                        console.error(`  Failed to crawl ${cls.name}: ${(error as Error).message}`);
                    }
                }
            } catch (error) {
                console.error(`  Failed to process library ${lib.name}: ${(error as Error).message}`);
            }
        }

        console.log('\nDevExpress crawl complete!');
    }

    /**
     * 爬取单个类
     */
    async crawlSingle(classUrl: string): Promise<ClassDoc> {
        return this.crawlClass(classUrl, '');
    }

    /**
     * 获取库列表
     */
    private async getLibraries(): Promise<{ name: string; url: string }[]> {
        const html = await this.fetchPage(`${this.baseUrl}/401349/vcl-controls`);
        return this.parser.parseLibraryList(html);
    }

    /**
     * 获取类列表
     */
    private async getClassList(libraryUrl: string): Promise<{ name: string; url: string }[]> {
        const html = await this.fetchPage(libraryUrl);
        return this.parser.parseClassList(html);
    }

    /**
     * 爬取类文档
     */
    private async crawlClass(classUrl: string, libraryName: string): Promise<ClassDoc> {
        const html = await this.fetchPage(classUrl);
        const classDoc = this.parser.parseClassPage(html, classUrl);

        // 尝试获取成员详情
        try {
            const membersUrl = this.getMembersUrl(classUrl);
            const membersHtml = await this.fetchPage(membersUrl);
            const members = this.parser.parseMembersPage(membersHtml);
            classDoc.members = members;
        } catch {
            // 成员页面可能不存在
            console.log(`    No members page for ${classDoc.name}`);
        }

        return classDoc;
    }

    /**
     * 构建成员页面 URL
     */
    private getMembersUrl(classUrl: string): string {
        // 格式: https://docs.devexpress.com/VCL/cxGrid.TcxGrid 
        // -> https://docs.devexpress.com/VCL/cxGrid.TcxGrid._members
        if (classUrl.includes('._members')) {
            return classUrl;
        }
        return `${classUrl}._members`;
    }
}
