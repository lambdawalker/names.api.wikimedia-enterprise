export type ErrorCode = 'unauthorized'|'forbidden'|'not_found'|'http'|'rate_limited'|'timeout'|'aborted'|'invalid_response'|'network'|'response_too_large'|'document_too_large';
export class SourceError extends Error {
 constructor(public readonly code:ErrorCode,message:string,public readonly status?:number,public readonly retryAfterMs?:number){super(message);this.name='SourceError';}
}
export function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)return Promise.reject(new SourceError('aborted','Request cancelled'));
 return new Promise((resolve,reject)=>{const abort=()=>reject(new SourceError('aborted','Request cancelled'));signal.addEventListener('abort',abort,{once:true});promise.then(v=>{signal.removeEventListener('abort',abort);resolve(v);},e=>{signal.removeEventListener('abort',abort);reject(e);});});
}
export async function readText(response:Response,max:number,signal:AbortSignal){
 if(!response.body)throw new SourceError('invalid_response','Empty provider response');const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{while(true){const{done,value}=await abortable(reader.read(),signal);if(done)break;size+=value.byteLength;if(size>max)throw new SourceError('response_too_large','Provider response exceeds limit');parts.push(value);}return Buffer.concat(parts).toString('utf8');}finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function httpError(status:number,after?:number){return new SourceError(status===401?'unauthorized':status===403?'forbidden':status===404?'not_found':status===429?'rate_limited':'http','Wikimedia Enterprise request failed',status,after);}
export function retryAfter(value:string|null,now=Date.now()){if(!value)return undefined;const n=/^[0-9]+(?:\.[0-9]+)?$/.test(value)?Number(value)*1000:Date.parse(value)-now;return Number.isFinite(n)?Math.max(0,Math.ceil(n)):undefined;}
export async function pause(ms:number,signal:AbortSignal){if(signal.aborted)throw new SourceError('aborted','Request cancelled');if(ms<=0)return;await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new SourceError('aborted','Request cancelled'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});}
export function parseJson(text:string):unknown{try{return JSON.parse(text);}catch{throw new SourceError('invalid_response','Provider returned invalid JSON');}}
