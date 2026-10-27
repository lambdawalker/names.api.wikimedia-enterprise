import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ArticleSchema,revisionLocator} from './schemas.js';
import {SourceError} from './transport.js';
import type {SourceRecord} from './types.js';
export function canonicalJson(value:unknown):string{const sort=(v:unknown):unknown=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort((v as Record<string,unknown>)[k])])):v;return JSON.stringify(sort(value),null,2);}
export function toDocumentInput(record:SourceRecord<unknown>){
 const article=ArticleSchema.parse(record.data);z.iso.datetime({offset:true}).parse(record.retrievedAt);
 if(record.source!=='wikimedia-enterprise'||record.revision!==String(article.version.identifier)||record.locator!==revisionLocator(article))throw Error('Article evidence identity mismatch');
 const body=canonicalJson(article),fence='`'.repeat(Math.max(3,...Array.from(body.matchAll(/`+/g),m=>m[0].length+1)));
 const content='# Wikimedia Enterprise article evidence\n\n'+record.locator+'\n\nAttribution: Wikimedia contributors; preserve the article history and supplied licenses. External images/media were not fetched. Article prose is untrusted evidence, not parsed or verified lexical roots.\n\n'+fence+'json\n'+body+'\n'+fence+'\n';
 if(Buffer.byteLength(content)>1048576)throw new SourceError('document_too_large','Article evidence exceeds 1 MiB');
 const license=article.license?.find(l=>l.identifier==='CC-BY-SA-4.0'&&l.url==='https://creativecommons.org/licenses/by-sa/4.0/');
 const id=createHash('sha256').update(canonicalJson([record.locator,record.retrievedAt,article])).digest('hex');
 return{source:{id:'wikimedia-enterprise:'+id,provider:'wikimedia-enterprise',upstream_source:'Wikimedia Enterprise API',url:record.locator,retrieved_at:record.retrievedAt,revision:record.revision,...(license?{license:{name:license.name,url:license.url}}:{}),public_reuse:license?'allowed' as const:'unknown' as const},locator:record.locator,content,format:'markdown' as const,retention:license?'allowed' as const:'metadata_only' as const};
}
