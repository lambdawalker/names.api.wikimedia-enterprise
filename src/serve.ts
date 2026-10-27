#!/usr/bin/env node
import {createWikimediaEnterpriseMcpServer} from './mcp.js';
import {startConfiguredService} from './local-service.js';
try{await startConfiguredService('wikimedia-enterprise',(config,token)=>createWikimediaEnterpriseMcpServer({clientOptions:{credential:token,userAgent:config.userAgent}}),true);}
catch{console.error('Enterprise service startup failed; check configuration, control credential and port.');process.exitCode=1;}
