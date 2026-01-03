#!/usr/bin/env node
/**
 * Delphi Doc MCP - Entry Point
 * 
 * MCP server for accessing Delphi documentation (RAD Studio VCL & DevExpress VCL)
 */

import { DelphiDocMcpServer } from './server/mcp-server.js';

async function main(): Promise<void> {
    const server = new DelphiDocMcpServer();
    await server.start();
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
