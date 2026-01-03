/**
 * Delphi Doc MCP - Free Pascal RTL Parser
 * 
 * Parse Free Pascal RTL documentation HTML pages
 * URL: https://www.freepascal.org/docs-html/rtl/
 */

import * as cheerio from 'cheerio';
import { ClassDoc, ClassMembers, MemberDoc, DocSource } from '../model/types.js';

export class FpcParser {
    /**
     * 解析类页面
     */
    parseClassPage(html: string, url: string): ClassDoc {
        const $ = cheerio.load(html);

        // 类名 - 从 h1 提取
        const name = $('h1').first().text().trim();

        // 单元名 - 从 URL 提取: /rtl/classes/tcomponent.html -> Classes
        const unit = this.extractUnitFromUrl(url);

        // 声明 - 从页面内容提取
        let declaration = '';
        const declText = $('h2:contains("Declaration")').nextUntil('h2').text();
        const classMatch = declText.match(/(\w+)\s*=\s*class\s*\([^)]+\)/);
        if (classMatch) {
            declaration = classMatch[0];
        } else if (name) {
            // 构建简单声明
            const inheritanceLinks = $('h2:contains("Inheritance")').nextUntil('h2').find('a').first().text();
            if (inheritanceLinks) {
                declaration = `${name} = class(${inheritanceLinks})`;
            }
        }

        // 描述
        let description = '';
        $('h2:contains("Description")').nextUntil('h2').each((_, el) => {
            const text = $(el).text().trim();
            if (text && !description) {
                description = text;
            }
        });

        // 继承链
        const inheritance = this.parseInheritance($);

        // 解析成员 (属性和方法)
        const members = this.parseMembers($);

        return {
            source: 'vcl' as DocSource, // 使用 'vcl' 因为 FPC RTL 与 Delphi VCL 兼容
            unit,
            name,
            declaration,
            inheritance,
            description,
            url,
            members,
        };
    }

    /**
     * 从 URL 提取单元名
     */
    private extractUnitFromUrl(url: string): string {
        // URL 格式: https://www.freepascal.org/docs-html/rtl/classes/tcomponent.html
        const match = url.match(/\/rtl\/([^/]+)\//);
        if (match) {
            // 首字母大写
            return match[1].charAt(0).toUpperCase() + match[1].slice(1);
        }
        return 'System';
    }

    /**
     * 解析继承链
     */
    private parseInheritance($: cheerio.CheerioAPI): string[] {
        const inheritance: string[] = [];

        $('h2:contains("Inheritance")').nextUntil('h2').find('a').each((_, el) => {
            const text = $(el).text().trim();
            if (text.startsWith('T') || text.startsWith('I')) {
                if (!inheritance.includes(text)) {
                    inheritance.push(text);
                }
            }
        });

        return inheritance;
    }

    /**
     * 解析成员
     */
    private parseMembers($: cheerio.CheerioAPI): ClassMembers {
        const members: ClassMembers = {
            properties: [],
            methods: [],
        };

        // 解析属性 (property 关键字)
        $('h2:contains("Declaration")').nextUntil('h2').each((_, el) => {
            const text = $(el).text();

            // 查找 property 声明
            const propMatches = text.matchAll(/property\s+\[?(\w+)\]?[^;]*;\s*\[([^\]]+)\]/g);
            for (const match of propMatches) {
                const name = match[1];
                const access = match[2]; // r, w, rw

                // 查找对应的描述
                const $link = $(`a:contains("${name}")`).first();
                const description = $link.parent().next().text().trim() ||
                    $link.closest('p').next('p').text().trim() || '';

                members.properties!.push({
                    name,
                    description: description.substring(0, 200),
                    type: access.includes('r') ? (access.includes('w') ? 'read/write' : 'read-only') : 'write-only',
                });
            }
        });

        // 解析类成员列表 (如果有表格)
        $('table').each((_, table) => {
            $(table).find('tr').each((_, row) => {
                const $cols = $(row).find('td');
                if ($cols.length >= 2) {
                    const nameText = $cols.eq(0).text().trim();
                    const desc = $cols.eq(1).text().trim();

                    if (nameText && !nameText.includes('Name')) {
                        // 判断是属性还是方法
                        if (nameText.includes('(') || nameText.includes('procedure') || nameText.includes('function')) {
                            members.methods!.push({ name: nameText.split('(')[0].trim(), description: desc });
                        } else {
                            members.properties!.push({ name: nameText, description: desc });
                        }
                    }
                }
            });
        });

        return members;
    }

    /**
     * 解析单元列表 (rtl/index.html)
     */
    parseUnitList(html: string): { name: string; url: string; description: string }[] {
        const $ = cheerio.load(html);
        const units: { name: string; url: string; description: string }[] = [];

        $('a[href*="/rtl/"]').each((_, el) => {
            const $a = $(el);
            const href = $a.attr('href') || '';
            const text = $a.text().trim();

            // 过滤单元链接 (排除 index.html, 只要目录)
            if (text &&
                href.includes('/rtl/') &&
                href.endsWith('/index.html') &&
                !href.endsWith('rtl/index.html')) {

                // 获取描述 (通常是链接后的文本)
                const description = $a.parent().text().replace(text, '').trim();

                let fullUrl = href;
                if (!href.startsWith('http')) {
                    fullUrl = `https://www.freepascal.org${href.startsWith('/') ? '' : '/docs-html/rtl/'}${href}`;
                }

                units.push({
                    name: text,
                    url: fullUrl,
                    description
                });
            }
        });

        return units;
    }

    /**
     * 解析单元中的类列表 (unit/index-4.html 或类似)
     */
    parseClassList(html: string, baseUrl: string): { name: string; url: string }[] {
        const $ = cheerio.load(html);
        const classes: { name: string; url: string }[] = [];
        const seen = new Set<string>();

        $('a').each((_, el) => {
            const $a = $(el);
            const href = $a.attr('href') || '';
            const text = $a.text().trim();

            // 过滤类链接 (T 或 E 开头，通常是类或异常)
            if ((text.startsWith('T') || text.startsWith('E')) &&
                text.length > 2 &&
                text.length < 50 &&
                !seen.has(text) &&
                !text.includes(' ') &&
                href.endsWith('.html') &&
                !href.includes('index')) {

                seen.add(text);

                // 构建完整 URL
                let fullUrl = href;
                if (!href.startsWith('http')) {
                    const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
                    fullUrl = baseDir + href;
                }

                classes.push({ name: text, url: fullUrl });
            }
        });

        return classes;
    }
}
