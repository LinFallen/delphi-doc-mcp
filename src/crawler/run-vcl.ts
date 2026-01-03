/**
 * Delphi Doc MCP - VCL Crawl Script
 * 
 * Run: npm run crawl:vcl
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { VclCrawler } from './vcl-crawler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

async function main(): Promise<void> {
    const crawler = new VclCrawler({
        cacheDir: path.join(projectRoot, '.cache/html'),
        outputDir: path.join(projectRoot, 'docs'),
        requestDelay: 2000,  // 2 秒间隔 (DocWiki 较慢)
        maxRetries: 3,
    });

    const args = process.argv.slice(2);

    if (args.includes('--test') || args.includes('-t')) {
        // 测试模式：只爬取一个类
        const testUrl = args[args.indexOf('--test') + 1] || args[args.indexOf('-t') + 1]
            || 'https://docwiki.embarcadero.com/Libraries/Sydney/en/Vcl.Forms.TForm';

        console.log(`Test mode: crawling ${testUrl}`);
        const doc = await crawler.crawlSingle(testUrl);
        console.log(JSON.stringify(doc, null, 2));
    } else {
        // 完整爬取
        await crawler.crawl();
    }
}

main().catch(console.error);
