import {Readable,Transform,type Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {WikimediaEnterpriseClient} from './client.js';
import {SnapshotId,Identifier} from './schemas.js';
import {abortable,httpError,SourceError} from './transport.js';
export interface DownloadOptions{maxBytes?:number;timeoutMs?:number;signal?:AbortSignal;fetch?:typeof fetch;chunk?:string}
/** Writes compressed bytes only: no archive extraction and no filesystem paths. */
export async function downloadSnapshot(client:WikimediaEnterpriseClient,identifier:string,output:Writable,options:DownloadOptions={}){
 SnapshotId.parse(identifier);if(options.chunk)Identifier.parse(options.chunk);
 const max=z.number().int().positive().max(1099511627776).parse(options.maxBytes??1073741824),timeout=AbortSignal.timeout(z.number().int().min(1).max(1800000).parse(options.timeoutMs??600000));
 const signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;const path='/v2/snapshots/'+identifier+(options.chunk?'/chunks/'+options.chunk:'')+'/download';
 let response:Response|undefined;
 try{
  response=await client.authorizedFetch(path,{method:'GET'},signal);
  if(response.status===307){const location=response.headers.get('location');void response.body?.cancel();if(!location)throw new SourceError('invalid_response','Download location missing');
   const url=new URL(location);if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!/(^|\.)(amazonaws\.com|enterprise\.wikimedia\.com)$/.test(url.hostname))throw new SourceError('invalid_response','Download location was rejected');
   response=await abortable((options.fetch??globalThis.fetch)(url,{method:'GET',redirect:'error',signal}),signal);
  }
  if(!response.ok){void response.body?.cancel();throw httpError(response.status);}if(!response.body)throw new SourceError('invalid_response','Empty archive response');
  const length=response.headers.get('content-length');const expected=length&&/^[0-9]+$/.test(length)?Number(length):undefined;if(expected!==undefined&&(!Number.isSafeInteger(expected)||expected>max))throw new SourceError('response_too_large','Snapshot exceeds byte limit');
  let bytes=0;const hash=createHash('sha256');const bound=new Transform({transform(chunk,encoding,done){bytes+=chunk.length;if(bytes>max){done(new SourceError('response_too_large','Snapshot exceeds byte limit'));return;}hash.update(chunk);done(null,chunk);}});
  await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>),bound,output,{signal});
  if(expected!==undefined&&bytes!==expected)throw new SourceError('invalid_response','Incomplete snapshot transfer');
  return{source:'wikimedia-enterprise',identifier,...(options.chunk?{chunk:options.chunk}:{}),locator:'https://api.enterprise.wikimedia.com'+path,bytes,sha256:hash.digest('hex'),retrievedAt:new Date().toISOString()};
 }catch(e){void response?.body?.cancel().catch(()=>{});if(options.signal?.aborted)throw new SourceError('aborted','Snapshot transfer cancelled');if(timeout.aborted)throw new SourceError('timeout','Snapshot transfer timed out');if(e instanceof SourceError)throw e;throw new SourceError('network','Snapshot transfer failed');}
}
