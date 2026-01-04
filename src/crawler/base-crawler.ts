/**
 * Delphi Doc MCP - Base Crawler
 * 
 * Abstract base class for documentation crawlers with caching support
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { CrawlerConfig } from '../model/types.js';

export abstract class BaseCrawler {
    protected client: AxiosInstance;
    protected config: CrawlerConfig;

    constructor(config: CrawlerConfig) {
        this.config = config;

        this.client = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
            },
        });
    }

    /**
     * 生成缓存路径
     */
    protected getCachePath(url: string): string {
        const hash = crypto.createHash('md5').update(url).digest('hex');
        const urlObj = new URL(url);
        const prefix = urlObj.hostname.replace(/\./g, '_');
        return path.join(this.config.cacheDir, prefix, `${hash}.html`);
    }

    /**
     * 获取页面内容（带缓存）
     */
    protected async fetchPage(url: string, forceRefresh = false): Promise<string> {
        const cachePath = this.getCachePath(url);

        // 检查缓存
        if (!forceRefresh && await fs.pathExists(cachePath)) {
            console.error(`[Cache Hit] ${url}`);
            return fs.readFile(cachePath, 'utf-8');
        }

        // 请求页面
        console.error(`[Fetching] ${url}`);

        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                await this.delay(this.config.requestDelay);
                const response = await this.client.get(url);
                const html = response.data;

                // 写入缓存
                await fs.ensureDir(path.dirname(cachePath));
                await fs.writeFile(cachePath, html, 'utf-8');

                return html;
            } catch (error) {
                lastError = error as Error;
                const axiosError = error as AxiosError;

                if (axiosError.response?.status === 404) {
                    throw new Error(`Page not found: ${url}`);
                }

                if (axiosError.response?.status === 403) {
                    throw new Error(`Access forbidden: ${url} - May need browser emulation`);
                }

                console.warn(`[Retry ${attempt}/${this.config.maxRetries}] ${url}: ${lastError.message}`);
                await this.delay(this.config.requestDelay * attempt);
            }
        }

        throw lastError || new Error(`Failed to fetch: ${url}`);
    }

    /**
     * 延迟
     */
    protected delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 保存文档到输出目录
     */
    protected async saveDoc<T>(doc: T, subDir: string, filename: string): Promise<void> {
        const dir = path.join(this.config.outputDir, subDir);
        await fs.ensureDir(dir);
        const filepath = path.join(dir, `${filename}.json`);
        await fs.writeJson(filepath, doc, { spaces: 2 });
        console.error(`[Saved] ${subDir}/${filename}.json`);
    }

    /**
     * 执行爬取
     */
    abstract crawl(): Promise<void>;
}
