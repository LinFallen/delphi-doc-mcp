/**
 * Delphi Doc MCP - Auto Crawler
 * 
 * Automatically crawl documentation on first run if docs are missing
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { DevExpressCrawler } from '../crawler/devexpress-crawler.js';
import { FpcCrawler } from '../crawler/fpc-crawler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AutoCrawlerOptions {
    docsDir: string;
    cacheDir: string;
    sources?: ('devexpress' | 'fpc')[];
}

export class AutoCrawler {
    private options: AutoCrawlerOptions;

    constructor(options: AutoCrawlerOptions) {
        this.options = {
            sources: ['devexpress', 'fpc'],
            ...options,
        };
    }

    /**
     * Check if documentation needs to be crawled
     */
    async needsCrawl(): Promise<boolean> {
        const docsDir = this.options.docsDir;

        // Check if docs directory exists
        if (!await fs.pathExists(docsDir)) {
            return true;
        }

        // Check if there are any JSON files for each source
        const hasDevExpress = await this.hasJsonFiles(path.join(docsDir, 'devexpress'));
        const hasFpc = await this.hasJsonFiles(path.join(docsDir, 'fpc'));

        // Return true if ANY source is missing (use OR, not AND)
        return !hasDevExpress || !hasFpc;
    }

    /**
     * Check if a directory has JSON files
     */
    private async hasJsonFiles(dir: string): Promise<boolean> {
        if (!await fs.pathExists(dir)) {
            return false;
        }

        const items = await fs.readdir(dir, { recursive: true });
        return items.some((item: any) => String(item).endsWith('.json'));
    }

    /**
     * Run auto-crawl for all configured sources
     */
    async crawl(progressCallback?: (message: string) => void): Promise<void> {
        const log = progressCallback || ((msg: string) => console.error(msg));

        log('🔄 First run detected - crawling documentation...');
        log('   This may take a few minutes. Subsequent runs will use cached data.');

        const crawlerConfig = {
            cacheDir: this.options.cacheDir,
            outputDir: this.options.docsDir,
            requestDelay: 1500,
            maxRetries: 3,
        };

        // Crawl FPC first (faster, more reliable)
        if (this.options.sources?.includes('fpc')) {
            log('📚 Crawling Free Pascal RTL documentation...');
            try {
                const fpcCrawler = new FpcCrawler(crawlerConfig);
                await fpcCrawler.crawl();
                log('✅ Free Pascal RTL documentation ready');
            } catch (error) {
                log(`⚠️ FPC crawl failed: ${(error as Error).message}`);
            }
        }

        // Crawl DevExpress
        if (this.options.sources?.includes('devexpress')) {
            log('📚 Crawling DevExpress VCL documentation...');
            try {
                const devExpressCrawler = new DevExpressCrawler(crawlerConfig);
                await devExpressCrawler.crawl();
                log('✅ DevExpress VCL documentation ready');
            } catch (error) {
                log(`⚠️ DevExpress crawl failed: ${(error as Error).message}`);
            }
        }

        log('🎉 Documentation ready!');
    }

    /**
     * Ensure documentation is available, crawling if necessary
     */
    async ensureDocs(progressCallback?: (message: string) => void): Promise<void> {
        if (await this.needsCrawl()) {
            await this.crawl(progressCallback);
        }
    }
}

/**
 * Get default directories based on platform
 */
export function getDefaultDirs(): { docsDir: string; cacheDir: string } {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const dataDir = path.join(homeDir, '.delphi-doc-mcp');

    return {
        docsDir: path.join(dataDir, 'docs'),
        cacheDir: path.join(dataDir, 'cache'),
    };
}
