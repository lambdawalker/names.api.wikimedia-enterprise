import {z} from 'zod';
import {abortable,readText,parseJson,httpError,SourceError} from './transport.js';
const Secret=z.string().min(1).max(12000).regex(/^[\x21-\x7e]+$/);
const Username=z.string().min(1).max(256).regex(/^[^\s\u0000-\u001f]+$/);
export const CredentialsSchema=z.strictObject({accessToken:Secret.optional(),username:Username.optional(),refreshToken:Secret.optional(),expiresAt:z.number().finite().nonnegative().optional()}).refine(v=>!!v.accessToken||!!(v.username&&v.refreshToken),'Access token or username/refresh token required').refine(v=>!v.refreshToken||!!v.username,'Refresh requires a username');
export type EnterpriseCredentials=z.infer<typeof CredentialsSchema>;
export interface AuthOptions{fetch?:typeof fetch;now?:()=>number}
const AuthResponse=z.object({access_token:Secret,refresh_token:Secret.optional(),expires_in:z.number().int().positive().max(604800)});
export function parseCredential(value:unknown):EnterpriseCredentials|undefined{
 if(value===undefined)return undefined;if(typeof value==='string')return value.trimStart().startsWith('{')?CredentialsSchema.parse(parseJson(value)):CredentialsSchema.parse({accessToken:value});return CredentialsSchema.parse(value);
}
async function exchange(path:'login'|'token-refresh',body:unknown,fetcher:typeof fetch,signal?:AbortSignal){
 const timeout=AbortSignal.timeout(15000),combined=signal?AbortSignal.any([timeout,signal]):timeout;
 try{const r=await abortable(fetcher('https://auth.enterprise.wikimedia.com/v1/'+path,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body),redirect:'error',signal:combined}),combined);if(!r.ok){void r.body?.cancel();throw httpError(r.status);}const parsed=AuthResponse.safeParse(parseJson(await readText(r,32768,combined)));if(!parsed.success)throw new SourceError('invalid_response','Invalid Enterprise authentication response');return parsed.data;}
 catch(e){if(signal?.aborted)throw new SourceError('aborted','Authentication cancelled');if(timeout.aborted)throw new SourceError('timeout','Authentication timed out');if(e instanceof SourceError)throw e;throw new SourceError('network','Authentication request failed');}
}
/** Local operator helper. Never register authentication as a model tool. */
export async function login(username:string,password:string,options:AuthOptions={}):Promise<EnterpriseCredentials>{
 const user=Username.parse(username).toLowerCase();z.string().min(1).max(4096).parse(password);const r=await exchange('login',{username:user,password},options.fetch??globalThis.fetch);if(!r.refresh_token)throw new SourceError('invalid_response','Login response omitted refresh token');return {username:user,accessToken:r.access_token,refreshToken:r.refresh_token,expiresAt:(options.now??Date.now)()+r.expires_in*1000};
}
export class EnterpriseSession{
 #state:EnterpriseCredentials|undefined;#closed=false;#refreshing:Promise<string>|undefined;#abort=new AbortController();#fetch:typeof fetch;#now:()=>number;
 constructor(value?:unknown,options:AuthOptions={}){this.#state=parseCredential(value);this.#fetch=options.fetch??globalThis.fetch;this.#now=options.now??Date.now;}
 async getToken(signal?:AbortSignal):Promise<string>{if(this.#closed||!this.#state)throw new SourceError('unauthorized','Enterprise credentials are not loaded');if(signal?.aborted)throw new SourceError('aborted','Request cancelled');const s=this.#state;if(!s.accessToken||(s.expiresAt!==undefined&&s.expiresAt<=this.#now()+30000))return this.refreshIfCurrent(s.accessToken??'',signal);return s.accessToken;}
 async refreshIfCurrent(previous:string,signal?:AbortSignal):Promise<string>{
  const s=this.#state;if(this.#closed||!s)throw new SourceError('unauthorized','Enterprise credentials are not loaded');if(s.accessToken&&s.accessToken!==previous)return s.accessToken;if(!s.username||!s.refreshToken)throw new SourceError('unauthorized','Enterprise access token expired; reload credentials');const combined=signal?AbortSignal.any([signal,this.#abort.signal]):this.#abort.signal;
  this.#refreshing??=(async()=>{const r=await exchange('token-refresh',{username:s.username,refresh_token:s.refreshToken},this.#fetch,combined);if(this.#closed||this.#state!==s)throw new SourceError('aborted','Credential session closed');this.#state={...s,accessToken:r.access_token,expiresAt:this.#now()+r.expires_in*1000};return r.access_token;})().finally(()=>{this.#refreshing=undefined;});return abortable(this.#refreshing,combined);
 }
 containsSecret(text:string){return [this.#state?.accessToken,this.#state?.refreshToken].some(s=>!!s&&[s,JSON.stringify(s).slice(1,-1),encodeURIComponent(s)].some(v=>text.includes(v)));}
 close(){this.#closed=true;this.#abort.abort();this.#state=undefined;}
}
