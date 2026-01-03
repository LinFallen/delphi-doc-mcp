/**
 * Delphi Doc MCP - Data Models
 * 
 * Core type definitions for document storage and search
 */

/**
 * 文档来源
 */
export type DocSource = 'vcl' | 'devexpress';

/**
 * 成员可见性
 */
export type Visibility = 'public' | 'protected' | 'private' | 'published';

/**
 * 成员类型
 */
export type MemberType = 'constructor' | 'property' | 'method' | 'event' | 'field';

/**
 * 成员文档
 */
export interface MemberDoc {
    name: string;
    type?: string;           // 数据类型
    visibility?: Visibility;
    params?: string;         // 方法参数
    returnType?: string;     // 返回类型
    description: string;
    url?: string;            // 原始文档链接
}

/**
 * 类成员集合
 */
export interface ClassMembers {
    constructors?: MemberDoc[];
    properties?: MemberDoc[];
    methods?: MemberDoc[];
    events?: MemberDoc[];
    fields?: MemberDoc[];
}

/**
 * 类文档模型
 */
export interface ClassDoc {
    source: DocSource;
    unit: string;            // 单元名称 (e.g., "Vcl.Forms", "cxGrid")
    name: string;            // 类名 (e.g., "TForm", "TcxGrid")
    declaration: string;     // 类声明 (e.g., "TForm = class(TCustomForm)")
    inheritance: string[];   // 继承链
    description: string;     // 类描述
    url: string;             // 原始文档 URL
    members: ClassMembers;
}

/**
 * 单元文档
 */
export interface UnitDoc {
    source: DocSource;
    name: string;            // 单元名称
    description?: string;
    classes: string[];       // 包含的类名列表
    url: string;
}

/**
 * 搜索结果
 */
export interface SearchResult {
    type: 'class' | 'member';
    source: DocSource;
    unit: string;
    className: string;
    memberName?: string;
    memberType?: MemberType;
    description: string;
    score: number;
}

/**
 * 当前选中的上下文
 */
export interface CurrentContext {
    source?: DocSource;
    unit?: string;
}

/**
 * 库信息
 */
export interface LibraryInfo {
    name: string;
    url: string;
    source: DocSource;
}

/**
 * 爬虫配置
 */
export interface CrawlerConfig {
    cacheDir: string;
    outputDir: string;
    requestDelay: number;
    maxRetries: number;
}

/**
 * 索引文档（用于 Lunr 索引）
 */
export interface IndexDocument {
    id: string;              // source:unit.className
    name: string;
    unit: string;
    source: DocSource;
    description: string;
    members: string;         // 成员名称列表（空格分隔）
}
