#!/usr/bin/env node
import {open,link,unlink} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {WikimediaEnterpriseClient} from './client.js';
import {downloadSnapshot} from './downloads.js';
const [operation,raw,output]=process.argv.slice(2);
const client=new WikimediaEnterpriseClient({credential:process.env.WIKIMEDIA_ENTERPRISE_CREDENTIAL,userAgent:'NamesResearch/0.1 (https://github.com/lambdawalker/names.api.wikimedia-enterprise)'});
let temporary:string|undefined;
try{
 if(!operation||!raw||Buffer.byteLength(raw)>4096)throw Error('arguments');
 const input=JSON.parse(raw);
 if(operation==='download_snapshot'){
  if(!output||!input||typeof input.identifier!=='string'||Object.keys(input).some(k=>!['identifier','chunk','maxBytes'].includes(k)))throw Error('arguments');
  temporary=output+'.partial-'+randomUUID();const file=await open(temporary,'wx',0o600);await file.close();
  const receipt=await downloadSnapshot(client,input.identifier,createWriteStream(temporary,{flags:'r+'}),{maxBytes:input.maxBytes,...(input.chunk?{chunk:input.chunk}:{})});
  // Hard link is exclusive: never overwrite an existing completed destination.
  await link(temporary,output);await unlink(temporary);temporary=undefined;console.log(JSON.stringify(receipt));
 }else{if(output||process.argv.length!==4)throw Error('arguments');console.log(JSON.stringify(await client.query(operation,input),null,2));}
}catch{console.error('Enterprise command failed. Use OPERATION JSON_ARGUMENTS or download_snapshot JSON_ARGUMENTS OUTPUT; configure credentials privately.');process.exitCode=1;}
finally{client.close();if(temporary)await unlink(temporary).catch(()=>{});}
