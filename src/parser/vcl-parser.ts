/**
 * Delphi Doc MCP - VCL Parser
 * 
 * Parse Embarcadero DocWiki HTML pages for RAD Studio VCL documentation
 */

import * as cheerio from 'cheerio';
import { ClassDoc, ClassMembers, MemberDoc, DocSource } from '../model/types.js';

export class VclParser {
    /**
     * 解析类页面
     */
    parseClassPage(html: string, url: string): ClassDoc {
        const $ = cheerio.load(html);

        // 类名 - 从 h1 或 title 提取
        let name = '';
        const titleText = $('h1.firstHeading, #firstHeading').text().trim();

        // 格式: "Vcl.Forms.TForm" -> "TForm"
        const parts = titleText.split('.');
        name = parts[parts.length - 1] || titleText;

        // 单元名 - 从 URL 或页面内容提取
        let unit = '';
        const unitMatch = url.match(/\/en\/([^/]+)$/);
        if (unitMatch) {
            // 格式: Vcl.Forms.TForm -> Vcl.Forms
            const fullPath = unitMatch[1].replace(/_/g, '.');
            const pathParts = fullPath.split('.');
            if (pathParts.length > 1) {
                unit = pathParts.slice(0, -1).join('.');
            }
        }

        // 声明 - 从代码块提取
        let declaration = '';
        $('pre, .delphi, code').each((_, el) => {
            const text = $(el).text().trim();
            if (text.includes('= class(') || text.includes('= class (')) {
                declaration = text.split('\n')[0].trim();
            }
        });

        // 描述
        let description = '';
        const descSection = $('#Description, h2:contains("Description")').first();
        if (descSection.length) {
            description = descSection.nextAll('p').first().text().trim();
        }

        if (!description) {
            // 尝试获取第一段
            $('#mw-content-text > p, .mw-parser-output > p').each((_, el) => {
                const text = $(el).text().trim();
                if (text.length > 30 && !description) {
                    description = text;
                }
            });
        }

        // 继承链
        const inheritance = this.parseInheritance($);

        return {
            source: 'vcl' as DocSource,
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
     * 解析继承链
     */
    private parseInheritance($: cheerio.CheerioAPI): string[] {
        const inheritance: string[] = [];

        // 从 Hierarchy 部分提取
        const hierarchySection = $('h2:contains("Hierarchy"), h3:contains("Hierarchy")');
        if (hierarchySection.length) {
            hierarchySection.nextAll('a, p a, ul a').slice(0, 20).each((_, el) => {
                const text = $(el).text().trim();
                if (text.startsWith('T') && !inheritance.includes(text)) {
                    inheritance.push(text);
                }
            });
        }

        // 从 See Also 或链接提取
        if (inheritance.length === 0) {
            $('a[href*="/Libraries/"]').each((_, el) => {
                const text = $(el).text().trim();
                if (text.startsWith('T') && text.length < 50 && !inheritance.includes(text)) {
                    inheritance.push(text);
                }
            });
        }

        return inheritance.slice(0, 15);
    }

    /**
     * 解析成员列表页 (Properties/Methods/Events/Fields)
     */
    parseMembersPage(html: string, memberType: keyof ClassMembers): MemberDoc[] {
        const $ = cheerio.load(html);
        const members: MemberDoc[] = [];

        // 解析表格
        $('table.wikitable, table.api, .mw-parser-output table').each((_, table) => {
            $(table).find('tr').each((_, row) => {
                const $cols = $(row).find('td');
                if ($cols.length >= 2) {
                    const name = $cols.eq(0).text().trim();
                    const description = $cols.eq($cols.length - 1).text().trim();

                    if (name && !name.includes('Name') && name.length < 100) {
                        // 提取可见性 (如果存在)
                        let visibility: string | undefined;
                        if ($cols.length >= 3) {
                            const visText = $cols.eq(1).text().trim().toLowerCase();
                            if (['public', 'protected', 'private', 'published'].includes(visText)) {
                                visibility = visText;
                            }
                        }

                        members.push({
                            name,
                            visibility: visibility as any,
                            description,
                        });
                    }
                }
            });
        });

        // 解析列表
        if (members.length === 0) {
            $('ul li, dl dt').each((_, item) => {
                const $item = $(item);
                const name = $item.find('a').first().text().trim() ||
                    $item.text().split(/[:\-–]/)[0].trim();
                const description = $item.find('dd').text().trim() ||
                    $item.text().split(/[:\-–]/).slice(1).join('-').trim();

                if (name && name.length < 100 && name.match(/^[A-Z]/)) {
                    members.push({ name, description });
                }
            });
        }

        return members;
    }

    /**
     * 解析单元列表
     */
    parseUnitList(html: string): { name: string; url: string }[] {
        const $ = cheerio.load(html);
        const units: { name: string; url: string }[] = [];
        const seen = new Set<string>();

        // 查找单元链接
        $('a[href*="/Libraries/"]').each((_, el) => {
            const $a = $(el);
            const href = $a.attr('href') || '';
            const text = $a.text().trim();

            // 过滤 Vcl.* 单元
            if (text.startsWith('Vcl.') &&
                !text.includes('.T') &&
                !seen.has(text) &&
                text.split('.').length <= 3) {

                seen.add(text);
                let fullUrl = href;
                if (!href.startsWith('http')) {
                    fullUrl = `https://docwiki.embarcadero.com${href}`;
                }

                units.push({ name: text, url: fullUrl });
            }
        });

        return units;
    }

    /**
     * 解析单元页面中的类列表
     */
    parseClassList(html: string): { name: string; url: string }[] {
        const $ = cheerio.load(html);
        const classes: { name: string; url: string }[] = [];
        const seen = new Set<string>();

        // 查找 Classes 部分
        const classesSection = $('h2:contains("Classes"), h3:contains("Classes")').first();
        let searchArea = classesSection.length
            ? classesSection.nextUntil('h2, h3')
            : $('#mw-content-text');

        searchArea.find('a').each((_, el) => {
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
                    fullUrl = `https://docwiki.embarcadero.com${href}`;
                }

                classes.push({ name: text, url: fullUrl });
            }
        });

        return classes;
    }
}
