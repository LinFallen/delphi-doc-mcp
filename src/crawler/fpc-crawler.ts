/**
 * Delphi Doc MCP - Free Pascal RTL Crawler
 * 
 * Crawl Free Pascal RTL documentation from freepascal.org
 * This provides an alternative to DocWiki for VCL-compatible documentation
 */

import { BaseCrawler } from './base-crawler.js';
import { FpcParser } from '../parser/fpc-parser.js';
import { ClassDoc, CrawlerConfig } from '../model/types.js';

export class FpcCrawler extends BaseCrawler {
    private parser: FpcParser;
    private readonly baseUrl = 'https://www.freepascal.org/docs-html/rtl';

    constructor(config: CrawlerConfig) {
        super(config);
        this.parser = new FpcParser();
    }

    /**
     * 执行完整爬取
     */
    async crawl(): Promise<void> {
        console.log('Starting Free Pascal RTL documentation crawl...');

        // 优先爬取的重要单元 (与 Delphi VCL 最兼容)
        const priorityUnits = [
            { name: 'Classes', url: `${this.baseUrl}/classes/index.html` },
            { name: 'SysUtils', url: `${this.baseUrl}/sysutils/index.html` },
            { name: 'System', url: `${this.baseUrl}/system/index.html` },
            { name: 'Types', url: `${this.baseUrl}/types/index.html` },
        ];

        for (const unit of priorityUnits) {
            console.log(`\nProcessing unit: ${unit.name}`);

            try {
                // 获取类列表页
                const classListUrl = unit.url.replace('index.html', 'index-4.html');
                const classListHtml = await this.fetchPage(classListUrl);
                const classes = this.parser.parseClassList(classListHtml, classListUrl);
                console.log(`  Found ${classes.length} classes`);

                // 爬取每个类
                for (const cls of classes) {
                    try {
                        const doc = await this.crawlClass(cls.url, unit.name);
                        if (doc.name && doc.name.length > 1) {
                            await this.saveDoc(doc, `fpc/${unit.name}`, doc.name);
                        }
                    } catch (error) {
                        console.error(`  Failed to crawl ${cls.name}: ${(error as Error).message}`);
                    }
                }
            } catch (error) {
                console.error(`  Failed to process unit ${unit.name}: ${(error as Error).message}`);
            }
        }

        console.log('\nFree Pascal RTL crawl complete!');
    }

    /**
     * 爬取单个类
     */
    async crawlSingle(classUrl: string): Promise<ClassDoc> {
        return this.crawlClass(classUrl, '');
    }

    /**
     * 爬取类文档
     */
    private async crawlClass(classUrl: string, unitName: string): Promise<ClassDoc> {
        const html = await this.fetchPage(classUrl);
        const classDoc = this.parser.parseClassPage(html, classUrl);

        if (!classDoc.unit && unitName) {
            classDoc.unit = unitName;
        }

        return classDoc;
    }
}
