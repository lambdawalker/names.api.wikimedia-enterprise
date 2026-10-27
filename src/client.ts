import {z} from 'zod';
import {EnterpriseSession,type EnterpriseCredentials} from './auth.js';
import {Operations,ArticleSchema,revisionLocator,type Operation,type Article} from './schemas.js';
import {SourceError,abortable,readText,parseJson,httpError,retryAfter,pause} from './transport.js';
import type {SourceRecord} from './types.js';
export interface EnterpriseOptions{credential?:string|EnterpriseCredentials;userAgent:string;fetch?:typeof fetch;intervalMs?:number;timeoutMs?:number;retries?:number;maxResponseBytes?:number;now?:()=>number}
export const API_BASE='https://api.enterprise.wikimedia.com';
export class WikimediaEnterpriseClient{
 #session:EnterpriseSession;#fetch:typeof fetch;#userAgent:string;#interval:number;#timeout:number;#retries:number;#max:number;#now:()=>number;#tail:Promise<unknown>=Promise.resolve();#last=0;#abort=new AbortController();
 constructor(options:EnterpriseOptions){if(!options.userAgent?.trim()||/[\r\n]/.test(options.userAgent))throw Error('An informative User-Agent is required');this.#fetch=options.fetch??globalThis.fetch;this.#now=options.now??Date.now;this.#session=new EnterpriseSession(options.credential,{fetch:this.#fetch,now:this.#now});this.#userAgent=options.userAgent;this.#interval=z.number().int().min(0).max(60000).parse(options.intervalMs??1000);this.#timeout=z.number().int().min(1).max(120000).parse(options.timeoutMs??15000);this.#retries=z.number().int().min(0).max(5).parse(options.retries??2);this.#max=z.number().int().min(1).max(8388608).parse(options.maxResponseBytes??1048576);}
 /** Fixed-path authenticated transport, shared with explicit library downloads. */
 async authorizedFetch(path:string,init:RequestInit,signal?:AbortSignal):Promise<Response>{
  if(!/^\/v2\/[A-Za-z0-9_%./!~*'()-]+$/.test(path)||path.includes('..'))throw Error('Invalid API path');const combined=signal?AbortSignal.any([signal,this.#abort.signal]):this.#abort.signal;let token=await this.#session.getToken(combined);
  for(let refresh=0;;refresh++){const r=await abortable(this.#fetch(API_BASE+path,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),authorization:'Bearer '+token,'user-agent':this.#userAgent},redirect:'manual',signal:combined}),combined);if(r.status!==401||refresh>0)return r;void r.body?.cancel();token=await this.#session.refreshIfCurrent(token,combined);}
 }
 async query(operation:string,input:unknown={},options:{signal?:AbortSignal}={}):Promise<SourceRecord<unknown>>{if(!Object.hasOwn(Operations,operation))throw Error('Unknown Enterprise operation');const op=operation as Operation,args=Operations[op].parse(input)as Record<string,unknown>;const task=this.#tail.then(()=>this.#run(op,args,options.signal));this.#tail=task.catch(()=>{});return options.signal?abortable(task,options.signal):task;}
 async getArticle(title:string,input:unknown):Promise<SourceRecord<Article>>{const args=z.strictObject({project:Operations.get_article.shape.project}).parse(input);return await this.query('get_article',{title,...args})as SourceRecord<Article>;}
 async #run(op:Operation,args:Record<string,unknown>,signal?:AbortSignal):Promise<SourceRecord<unknown>>{
  const timeout=AbortSignal.timeout(this.#timeout),combined=AbortSignal.any([timeout,this.#abort.signal,...(signal?[signal]:[])]);let path:string,method='GET',body:string|undefined;
  if(op==='get_article'){path='/v2/articles/'+encodeURIComponent(String(args.title));method='POST';body=JSON.stringify({filters:[{field:'is_part_of.identifier',value:args.project}],limit:1});}
  else if(op.includes('snapshot')){path='/v2/snapshots'+(args.identifier?'/'+args.identifier:'')+(op==='list_snapshot_chunks'||op==='get_snapshot_chunk'?'/chunks':'')+(op==='get_snapshot_chunk'?'/'+args.chunk:'')+(op==='inspect_snapshot'?'/download':'');if(op==='inspect_snapshot')method='HEAD';}
  else{const type=op.replace(/^(list|get)_/,'').replace(/^(code|language|project|namespace)$/,'$1s');path='/v2/'+type+(args.identifier!==undefined?'/'+args.identifier:'');}
  try{for(let attempt=0;;attempt++){
   await pause(Math.max(0,this.#last+this.#interval-Date.now()),combined);this.#last=Date.now();const r=await this.authorizedFetch(path,{method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{})},...(body?{body}:{})},combined);
   if(!r.ok){void r.body?.cancel();const wait=retryAfter(r.headers.get('retry-after'),this.#now())??1000*2**attempt;if([429,500,502,503,504].includes(r.status)&&attempt<this.#retries&&wait<=60000){await pause(wait,combined);continue;}throw httpError(r.status,wait);}
   if(method==='HEAD'){const metadata={content_length:r.headers.get('content-length'),etag:r.headers.get('etag'),last_modified:r.headers.get('last-modified'),content_type:r.headers.get('content-type')};if(Object.values(metadata).some(v=>v!==null&&v.length>4096)||this.#session.containsSecret(JSON.stringify(metadata)))throw new SourceError('invalid_response','Snapshot metadata was rejected');return this.#record(path,metadata);}
   const text=await readText(r,this.#max,combined);if(this.#session.containsSecret(text))throw new SourceError('invalid_response','Provider response was rejected');let data=parseJson(text),revision:string|undefined,locator=API_BASE+path;
   if(op==='get_article'){const parsed=z.array(ArticleSchema).max(1).safeParse(data);if(!parsed.success)throw new SourceError('invalid_response','Invalid article response');const article=parsed.data[0];if(!article)throw new SourceError('not_found','Article not found');if(article.is_part_of.identifier!==args.project||article.name.replaceAll('_',' ').normalize('NFC')!==String(args.title).replaceAll('_',' ').normalize('NFC'))throw new SourceError('invalid_response','Unexpected article project');try{locator=revisionLocator(article);}catch{throw new SourceError('invalid_response','Invalid article source URL');}revision=String(article.version.identifier);data=article;}
   else if(op.startsWith('list_')){if(!Array.isArray(data))throw new SourceError('invalid_response','Expected a provider list');}
   else if(!data||typeof data!=='object'||Array.isArray(data)||(data as Record<string,unknown>).identifier!==(op==='get_snapshot_chunk'?args.chunk:args.identifier))throw new SourceError('invalid_response','Unexpected provider identity');
   return{...this.#record(path,data),locator,...(revision?{revision}:{}),...(r.headers.get('cache-control')?{cacheControl:r.headers.get('cache-control')!}:{})};
  }}catch(e){if(signal?.aborted||this.#abort.signal.aborted)throw new SourceError('aborted','Request cancelled');if(timeout.aborted)throw new SourceError('timeout','Enterprise request timed out');if(e instanceof SourceError)throw e;throw new SourceError('network','Enterprise request failed');}
 }
 #record(path:string,data:unknown):SourceRecord<unknown>{return{source:'wikimedia-enterprise',upstreamSource:'Wikimedia Enterprise API',locator:API_BASE+path,retrievedAt:new Date(this.#now()).toISOString(),data};}
 close(){this.#abort.abort();this.#session.close();}
}
