/**
 * Delphi Doc MCP - VCL Crawler
 * 
 * Crawl RAD Studio VCL documentation from Embarcadero DocWiki using Puppeteer
 * to bypass Cloudflare protection
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { VclParser } from '../parser/vcl-parser.js';
import { ClassDoc, CrawlerConfig } from '../model/types.js';

export class VclCrawler {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private parser: VclParser;
    private config: CrawlerConfig;
    private readonly baseUrl = 'https://docwiki.embarcadero.com/Libraries/Sydney/en';

    constructor(config: CrawlerConfig) {
        this.config = config;
        this.parser = new VclParser();
    }

    /**
     * 初始化浏览器
     */
    private async initBrowser(): Promise<void> {
        if (this.browser) return;

        console.log('Launching browser...');
        this.browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ],
        });

        this.page = await this.browser.newPage();

        // 设置 User-Agent
        await this.page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // 设置视口
        await this.page.setViewport({ width: 1920, height: 1080 });

        console.log('Browser ready');
    }

    /**
     * 关闭浏览器
     */
    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }

    /**
     * 生成缓存路径
     */
    private getCachePath(url: string): string {
        const hash = crypto.createHash('md5').update(url).digest('hex');
        return path.join(this.config.cacheDir, 'docwiki', `${hash}.html`);
    }

    /**
     * 获取页面内容（带缓存）
     */
    private async fetchPage(url: string, forceRefresh = false): Promise<string> {
        const cachePath = this.getCachePath(url);

        // 检查缓存
        if (!forceRefresh && await fs.pathExists(cachePath)) {
            console.log(`[Cache Hit] ${url}`);
            return fs.readFile(cachePath, 'utf-8');
        }

        await this.initBrowser();
        if (!this.page) throw new Error('Browser not initialized');

        console.log(`[Fetching] ${url}`);

        const maxRetries = 3;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Ensure page is available
                if (!this.page) {
                    await this.initBrowser();
                }
                const page = this.page!;

                // 导航到页面
                const response = await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000,
                });

                // 等待页面稳定
                await this.delay(2000);

                // 检查是否是 Cloudflare 挑战页面
                let html = await page.content();

                if (html.includes('Just a moment') || html.includes('Checking your browser') ||
                    html.includes('cf-browser-verification')) {
                    console.log(`  [Attempt ${attempt}] Cloudflare challenge detected, waiting...`);

                    // 等待更长时间让挑战完成
                    await this.delay(8000);

                    // 等待实际内容
                    try {
                        await page.waitForSelector('#mw-content-text, .mw-parser-output, #firstHeading', {
                            timeout: 30000,
                        });
                    } catch {
                        // 继续尝试获取内容
                    }

                    html = await page.content();

                    // 如果仍然是 Cloudflare 页面，重试
                    if (html.includes('Just a moment') || html.includes('Checking your browser')) {
                        if (attempt < maxRetries) {
                            console.log(`  [Attempt ${attempt}] Challenge not passed, retrying...`);
                            await this.delay(3000);
                            continue;
                        }
                        throw new Error('Cloudflare challenge not passed after retries');
                    }
                }

                // 验证我们获得了有效内容
                if (html.includes('#mw-content-text') || html.includes('mw-parser-output') ||
                    html.includes('firstHeading') || html.length > 10000) {
                    // 写入缓存
                    await this.saveToCache(cachePath, html);

                    // 请求间隔
                    await this.delay(this.config.requestDelay);

                    return html;
                }

                // 内容太短，可能是问题
                if (attempt < maxRetries) {
                    console.log(`  [Attempt ${attempt}] Content seems incomplete, retrying...`);
                    await this.delay(3000);
                    continue;
                }

                // 最后一次尝试，返回我们有的
                await this.saveToCache(cachePath, html);
                return html;

            } catch (error) {
                lastError = error as Error;
                const errMsg = lastError.message;

                // 导航或上下文错误 - 重新初始化浏览器
                if (errMsg.includes('Execution context') || errMsg.includes('navigation') ||
                    errMsg.includes('Target closed') || errMsg.includes('Session closed')) {
                    console.log(`  [Attempt ${attempt}] Browser context error, reinitializing...`);

                    // 关闭并重新打开浏览器
                    await this.close();
                    this.browser = null;
                    this.page = null;
                    await this.initBrowser();

                    if (attempt < maxRetries) {
                        await this.delay(2000);
                        continue;
                    }
                }

                console.error(`  [Attempt ${attempt}] Error: ${errMsg}`);

                if (attempt < maxRetries) {
                    await this.delay(3000 * attempt);
                }
            }
        }

        throw lastError || new Error(`Failed to fetch: ${url}`);
    }

    /**
     * 保存到缓存
     */
    private async saveToCache(cachePath: string, html: string): Promise<void> {
        await fs.ensureDir(path.dirname(cachePath));
        await fs.writeFile(cachePath, html, 'utf-8');
    }

    /**
     * 延迟
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 保存文档
     */
    private async saveDoc(doc: ClassDoc): Promise<void> {
        const dir = path.join(this.config.outputDir, 'vcl', doc.unit.replace(/\./g, '/'));
        await fs.ensureDir(dir);
        const filepath = path.join(dir, `${doc.name}.json`);
        await fs.writeJson(filepath, doc, { spaces: 2 });
        console.log(`[Saved] vcl/${doc.unit}/${doc.name}.json`);
    }

    /**
     * 执行完整爬取
     */
    async crawl(): Promise<void> {
        console.log('Starting VCL documentation crawl...');

        try {
            // 1. 获取 Vcl 单元列表
            const vclListUrl = `${this.baseUrl}/Vcl`;
            const vclListHtml = await this.fetchPage(vclListUrl);
            const units = this.parser.parseUnitList(vclListHtml);
            console.log(`Found ${units.length} VCL units`);

            // 2. 遍历每个单元
            for (const unit of units.slice(0, 10)) { // 限制爬取数量用于测试
                console.log(`\nProcessing unit: ${unit.name}`);

                try {
                    const unitHtml = await this.fetchPage(unit.url);
                    const classes = this.parser.parseClassList(unitHtml);
                    console.log(`  Found ${classes.length} classes`);

                    // 3. 爬取每个类
                    for (const cls of classes.slice(0, 5)) { // 限制每个单元的类数量
                        try {
                            const doc = await this.crawlClass(cls.url, unit.name);
                            if (doc.name) {
                                await this.saveDoc(doc);
                            }
                        } catch (error) {
                            console.error(`  Failed to crawl ${cls.name}: ${(error as Error).message}`);
                        }
                    }
                } catch (error) {
                    console.error(`  Failed to process unit ${unit.name}: ${(error as Error).message}`);
                }
            }

            console.log('\nVCL crawl complete!');
        } finally {
            await this.close();
        }
    }

    /**
     * 爬取单个类
     */
    async crawlSingle(classUrl: string): Promise<ClassDoc> {
        try {
            const doc = await this.crawlClass(classUrl, '');
            return doc;
        } finally {
            await this.close();
        }
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

        // 尝试获取成员详情 (Properties, Methods, Events)
        const memberTypes: Array<{ type: keyof ClassDoc['members']; suffix: string }> = [
            { type: 'properties', suffix: '_Properties' },
            { type: 'methods', suffix: '_Methods' },
            { type: 'events', suffix: '_Events' },
            { type: 'fields', suffix: '_Fields' },
        ];

        for (const { type, suffix } of memberTypes) {
            try {
                const membersUrl = classUrl + suffix;
                const membersHtml = await this.fetchPage(membersUrl);
                const members = this.parser.parseMembersPage(membersHtml, type);
                if (members.length > 0) {
                    classDoc.members[type] = members;
                }
            } catch {
                // 成员页面可能不存在
            }
        }

        return classDoc;
    }
}
