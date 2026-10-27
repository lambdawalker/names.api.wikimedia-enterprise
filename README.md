# names.api.wikimedia-enterprise

Wikimedia Enterprise source client for Node.js 24+ and TypeScript. Supports official Bearer authentication, in-memory refresh, exact-title article lookup, metadata discovery, snapshot/chunk metadata and bounded compressed snapshot downloads. Includes a CLI, 14 read-only agent MCP tools and an authenticated loopback API.

## Setup with the orchestrator

Build this checkout beside `ds.names.orchestrator`:

```sh
npm ci
```

In the orchestrator checkout, initialize its vault if needed, then run:

```sh
npm run vault:enterprise-login
```

The terminal privately asks for the vault passphrase, your Enterprise username and your password. The orchestrator validates the vault before using the account, loads this configured sibling's compiled `login` helper and saves only the returned access/refresh bundle in its encrypted vault. No password is saved and no token is printed. Use a verified Wikimedia Enterprise account; Wikimedia contributor login credentials are not interchangeable with an Enterprise account.

In the orchestrator's `config.default.yaml`, set `services.wikimedia-enterprise.enabled: true`. Enterprise remains disabled by default so installations without an account can run the other sources. Port defaults to **127.0.0.1:4324**. No real account credentials were used during automated verification; the first live account lookup remains a local setup check.

## Library

```ts
import {WikimediaEnterpriseClient, toDocumentInput} from '@lambdawalker/names-api-wikimedia-enterprise';
const client = new WikimediaEnterpriseClient({
  userAgent: 'MyNamesResearch/1 (contact@example.com)',
  credential: accessToken // or {username, refreshToken, accessToken?, expiresAt?}
});
try {
  const article = await client.getArticle('David', {project: 'enwiki'});
  const document = toDocumentInput(article);
  const projects = await client.query('list_projects');
  const snapshot = await client.query('get_snapshot', {identifier: 'enwiki_namespace_0'});
} finally { client.close(); }
```

`login(username, password)` returns a credential bundle to a trusted local caller. `EnterpriseSession` handles refresh via the documented username/refresh-token body. Access credentials are never model tools. A plain access token cannot renew itself; use a refresh bundle or reseed after expiration. Refresh responses need not repeat the refresh token: the original is retained in memory. Closing a session aborts refresh and prevents late responses reviving it. An access-token 401 triggers at most one refresh/retry; 403 is reported without reauthentication.

Bundles may be JSON encoded as the existing credential endpoint's string value. Startup decrypts and seeds the bundle from the orchestrator vault. Refreshed access tokens stay in memory; the persisted refresh token is reused at later startups. Provider refresh lifetime/count limits still apply, so rerun the hidden login command when the refresh token expires or its allowance is exhausted.

## API and agent tools

| Tool | Arguments |
|---|---|
| list_codes / get_code | empty / identifier |
| list_languages / get_language | empty / identifier |
| list_projects / get_project | empty / identifier |
| list_namespaces / get_namespace | empty / numeric identifier |
| list_snapshots / get_snapshot | empty / snapshot identifier |
| list_snapshot_chunks | snapshot identifier |
| get_snapshot_chunk | snapshot identifier; chunk identifier |
| inspect_snapshot | snapshot identifier; reads HEAD headers, no download |
| get_article | exact title; project identifier such as enwiki |

Article reads POST an exact-title lookup with a project filter and limit 1. These are read operations, not a search API. Returned title (only NFC and underscore/space normalization), project URL and required identity/revision fields are validated and additional provider fields preserved. Article results use a Wikimedia revision URL and timestamp; page identifiers and revision identifiers remain distinct. Metadata/snapshot reads retain the official request URL and returned identifiers.

`npm run mcp` starts stdio MCP. Private `WIKIMEDIA_ENTERPRISE_CREDENTIAL` accepts a plain access token or JSON bundle; a missing credential leaves data reads locked but allows tool discovery. Each tool returns provider JSON in bounded UTF-16 chunks: continue with the same selection, `snapshot` and returned `next_offset`. Expired/evicted/changed snapshots fail; they are not silently refetched midway. Limits: eight cached snapshots, five minutes, at most 1 MiB canonical JSON, 8,000 units per chunk and 64 KiB per MCP result. Treat article text as untrusted evidence.

`npm run serve` starts the local API. Supply a private `NAMES_CONTROL_TOKEN` of at least 32 characters or let the orchestrator create it. `NAMES_SERVICE_PORT` overrides YAML. The control token and provider credentials are separate.

- `GET /health`: service/boot identity and credential-loaded boolean.
- `POST /v1/credentials`: authenticated `{ "token": "ACCESS_TOKEN_OR_JSON_BUNDLE" }` or `{ "token": null }`; memory only. Rotation closes the prior MCP/cache/session epoch.
- `GET /v1/tools`: authenticated MCP descriptions.
- `POST /v1/tools/TOOL_NAME`: authenticated tool arguments.

`npm run mcp:remote` is the stdio bridge to that API using private `NAMES_SERVICE_URL` and `NAMES_CONTROL_TOKEN`. It is not a Streamable HTTP `/mcp` endpoint. Browser Origin and unexpected Host requests are rejected.

## Snapshot downloads

Bulk archive transfers are explicit **library/CLI operations**, not model tools or automatic startup activity. Use `downloadSnapshot(client, identifier, writable, {maxBytes, signal, chunk?})`, which honors backpressure and returns byte count, SHA-256 and the official API locator. It does not extract tar files, resume partial downloads or perform bulk ingestion.

For a configured private credential environment, the CLI accepts an operation and JSON arguments. Linux shell examples:

```sh
npm run research -- get_article '{"title":"David","project":"enwiki"}'
npm run research -- download_snapshot '{"identifier":"enwiki_namespace_0","maxBytes":1073741824}' ./enwiki.tar.gz
```

PowerShell native-command JSON quoting varies by version; the library and orchestrator hidden setup avoid putting provider credentials in arguments. Do not paste tokens into chat or tracked JSON.

The downloader follows one provider-issued HTTPS 307 URL, strips API Authorization, and rejects further redirects. Allowed storage hosts end at the `amazonaws.com` or `enterprise.wikimedia.com` domain boundary; unexpected storage hosts fail closed. Presigned URLs are never returned in receipts/MCP or included in error text. Transfers are bounded to 1 GiB/10 minutes by default (configurable up to 1 TiB/30 minutes), and fail on size mismatch or interruption. The CLI uses a temporary file, publishes only a completed transfer and never overwrites an existing destination. Large Wikipedia snapshots usually exceed the default cap: inspect size first and deliberately choose a higher bound or a chunk.

## Evidence and limits

`toDocumentInput` preserves full article JSON in fenced Markdown, including original wikitext/HTML, attribution and revision. It is not a lexical-root parser or HTML renderer. Recognized CC BY-SA 4.0 text includes its supplied license; unknown licenses default to metadata-only retention. External media are not fetched or relicensed. Human review and corroboration remain necessary for historical claims.

JSON reads are serialized and bounded to 1 MiB by default (up to 8 MiB configurable), with a 15-second deadline, one-second default request interval and at most two transient retries. JSON/auth redirects fail. Account quotas remain enforced by the provider; there is no automatic fallback to another source.

This milestone excludes paid realtime feeds, beta Structured Contents/Wikidata endpoints, archive extraction and resumable bulk ingestion. The orchestrator's existing four-tool root research scope is unchanged.

## Verification and references

`npm test`, `npm run typecheck`, `npm pack --dry-run`. Tests use synthetic tokens and documented payload fixtures; they exercise actual MCP/stdio/local HTTP protocols and bounded streams without a provider account.

- [Official authentication](https://enterprise.wikimedia.com/docs/authentication/)
- [On-demand articles](https://enterprise.wikimedia.com/docs/on-demand/)
- [Metadata](https://enterprise.wikimedia.com/docs/metadata/)
- [Snapshots](https://enterprise.wikimedia.com/docs/snapshot/)
- [OpenAPI](https://enterprise.wikimedia.com/docs/api/wme-api.yaml)
- [Official Python SDK evaluated](https://github.com/wikimedia-enterprise/wme-sdk-python): the TypeScript adapter avoids its separate runtime and plaintext token-file lifecycle.
