#!/usr/bin/env node
import {StdioServerTransport} from '@modelcontextprotocol/server/stdio';
import {createWikimediaEnterpriseMcpServer} from './mcp.js';
try{await createWikimediaEnterpriseMcpServer({clientOptions:{userAgent:'NamesResearch/0.1 (https://github.com/lambdawalker/names.api.wikimedia-enterprise)',credential:process.env.WIKIMEDIA_ENTERPRISE_CREDENTIAL}}).connect(new StdioServerTransport());}
catch{console.error('Enterprise MCP startup failed; check the private credential configuration.');process.exitCode=1;}
