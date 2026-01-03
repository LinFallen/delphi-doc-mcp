/**
 * Delphi Doc MCP - DevExpress Parser
 * 
 * Parse DevExpress VCL documentation HTML pages
 */

import * as cheerio from 'cheerio';
import { ClassDoc, ClassMembers, MemberDoc, DocSource } from '../model/types.js';

export class DevExpressParser {
    /**
     * 解析类页面
     */
    parseClassPage(html: string, url: string): ClassDoc {
        const $ = cheerio.load(html);

        // 类名 - 从 h1 提取
        let name = $('h1').first().text().trim();
        name = name.replace(/\s*Class\s*$/i, '').trim();

        // 单元名 - 从 URL 或面包屑提取
        let unit = this.extractUnitFromUrl(url);

        // 声明 - 从 code block 提取
        let declaration = '';
        $('pre code, .code-block code').each((_, el) => {
            const text = $(el).text().trim();
            if (text.includes('= class(') || text.includes('= class (')) {
                declaration = text.replace(/\s+/g, ' ').trim();
            }
        });

        if (!declaration && name) {
            // 尝试从页面文本构建
            const parentMatch = html.match(new RegExp(`${name}\\s*=\\s*class\\s*\\(\\s*(\\w+)\\s*\\)`));
            if (parentMatch) {
                declaration = `${name} = class(${parentMatch[1]})`;
            }
        }

        // 描述 - 从 Remarks 段落提取
        let description = '';
        const remarksHeader = $('h2:contains("Remarks"), h2:contains("Description")').first();
        if (remarksHeader.length) {
            const nextP = remarksHeader.nextAll('p').first();
            description = nextP.text().trim();
        }

        if (!description) {
            // 尝试从页面首段提取
            $('article p, .content p').each((_, el) => {
                const text = $(el).text().trim();
                if (text.length > 50 && !description) {
                    description = text;
                }
            });
        }

        // 继承链
        const inheritance = this.parseInheritance($);

        return {
            source: 'devexpress' as DocSource,
            unit,
            name,
            declaration,
            inheritance,
            description,
            url,
            members: {},
        };
    }

    /**
     * 从 URL 提取单元名
     */
    private extractUnitFromUrl(url: string): string {
        // URL 格式: https://docs.devexpress.com/VCL/cxGrid.TcxGrid
        const match = url.match(/\/VCL\/([^./]+)/);
        if (match) {
            return match[1];
        }

        // 尝试其他格式
        const parts = url.split('/').filter(Boolean);
        const vclIndex = parts.indexOf('VCL');
        if (vclIndex !== -1 && parts[vclIndex + 1]) {
            const unitPart = parts[vclIndex + 1].split('.')[0];
            return unitPart;
        }

        return 'unknown';
    }

    /**
     * 解析继承链
     */
    private parseInheritance($: cheerio.CheerioAPI): string[] {
        const inheritance: string[] = [];

        // 查找 Inheritance 部分
        const inheritanceSection = $('h2:contains("Inheritance")').first();
        if (inheritanceSection.length) {
            inheritanceSection.nextAll('a, p a').each((_, el) => {
                const text = $(el).text().trim();
                if (text.startsWith('T') && !inheritance.includes(text)) {
                    inheritance.push(text);
                }
            });
        }

        // 从页面链接提取
        if (inheritance.length === 0) {
            $('a[href*="docwiki.embarcadero.com"], a[href*="docs.devexpress.com"]').each((_, el) => {
                const text = $(el).text().trim();
                if (text.startsWith('T') && text.length < 50 && !inheritance.includes(text)) {
                    inheritance.push(text);
                }
            });
        }

        return inheritance;
    }

    /**
     * 解析成员列表页
     */
    parseMembersPage(html: string): ClassMembers {
        const $ = cheerio.load(html);
        const members: ClassMembers = {
            constructors: [],
            properties: [],
            methods: [],
            events: [],
            fields: [],
        };

        // 解析表格中的成员
        $('table').each((_, table) => {
            const $table = $(table);
            const $prevHeader = $table.prevAll('h2, h3').first();
            const headerText = $prevHeader.text().toLowerCase();

            let category: keyof ClassMembers | null = null;
            if (headerText.includes('constructor')) category = 'constructors';
            else if (headerText.includes('propert')) category = 'properties';
            else if (headerText.includes('method')) category = 'methods';
            else if (headerText.includes('event')) category = 'events';
            else if (headerText.includes('field')) category = 'fields';

            if (category) {
                $table.find('tr').each((_, row) => {
                    const $cols = $(row).find('td');
                    if ($cols.length >= 2) {
                        const name = $cols.eq(0).text().trim();
                        const description = $cols.eq(1).text().trim();

                        if (name && !name.includes('Name') && members[category]) {
                            const member: MemberDoc = { name, description };
                            members[category]!.push(member);
                        }
                    }
                });
            }
        });

        // 解析列表中的成员
        $('h2, h3, h4').each((_, header) => {
            const $header = $(header);
            const title = $header.text().toLowerCase();

            let category: keyof ClassMembers | null = null;
            if (title.includes('constructor')) category = 'constructors';
            else if (title.includes('propert')) category = 'properties';
            else if (title.includes('method')) category = 'methods';
            else if (title.includes('event')) category = 'events';

            if (category) {
                const $list = $header.nextAll('ul, dl').first();
                $list.find('li, dt').each((_, item) => {
                    const $item = $(item);
                    const name = $item.find('a').first().text().trim() || $item.text().split(/[:\-–]/)[0].trim();
                    const description = $item.find('dd').text().trim() ||
                        $item.text().split(/[:\-–]/).slice(1).join('-').trim();

                    if (name && name.length < 100 && members[category]) {
                        members[category]!.push({ name, description });
                    }
                });
            }
        });

        return members;
    }

    /**
     * 解析库列表
     */
    parseLibraryList(html: string): { name: string; url: string }[] {
        const $ = cheerio.load(html);
        const libraries: { name: string; url: string }[] = [];
        const seen = new Set<string>();

        // 查找指向库/控件页面的链接
        $('a[href*="/VCL/"]').each((_, el) => {
            const $a = $(el);
            const href = $a.attr('href') || '';
            const text = $a.text().trim();

            // 过滤有效的库链接
            if (href &&
                text &&
                text.length > 3 &&
                text.length < 100 &&
                !text.includes('VCL Controls') &&
                !text.includes('What\'s New') &&
                !seen.has(text)) {

                seen.add(text);
                let fullUrl = href;
                if (!href.startsWith('http')) {
                    fullUrl = `https://docs.devexpress.com${href}`;
                }

                libraries.push({ name: text, url: fullUrl });
            }
        });

        return libraries;
    }

    /**
     * 解析类列表
     */
    parseClassList(html: string): { name: string; url: string }[] {
        const $ = cheerio.load(html);
        const classes: { name: string; url: string }[] = [];
        const seen = new Set<string>();

        // 查找以 T 开头的类链接
        $('a').each((_, el) => {
            const $a = $(el);
            const href = $a.attr('href') || '';
            const text = $a.text().trim();

            // 过滤类链接 (T 开头)
            if (text.startsWith('T') &&
                text.length > 2 &&
                text.length < 100 &&
                !seen.has(text) &&
                !text.includes(' ')) {

                seen.add(text);
                let fullUrl = href;
                if (!href.startsWith('http')) {
                    fullUrl = `https://docs.devexpress.com${href}`;
                }

                classes.push({ name: text, url: fullUrl });
            }
        });

        return classes;
    }
}
