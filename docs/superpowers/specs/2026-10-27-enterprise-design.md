# Wikimedia Enterprise client

Implement the remaining source client in the existing Node 24/TypeScript architecture. Use the current official OpenAPI reference, not old basic-auth documentation. Official SDKs are Go/Python; a thin TypeScript adapter avoids a second runtime and plaintext SDK token files.

Support login and refresh helpers, in-memory access/refresh credentials, metadata discovery, exact-title project-filtered articles, snapshot/chunk metadata and bounded streaming tar.gz downloads. No realtime firehose or beta Structured Contents/Wikidata endpoints in this milestone. Do not extract archives or expose download paths/authentication to the model.

Expose read-only bounded snapshot-paged MCP tools and the established authenticated local API on 127.0.0.1:4324. The existing memory-only credential endpoint accepts a plain access token or a JSON credential bundle. Retain provenance and provider revision/license fields. Never treat an article as parsed lexical roots. Source text is untrusted.

The orchestrator manages the service and encrypted vault. Add a hidden-terminal login command which loads the trusted compiled sibling source adapter, then encrypts its access/refresh credential bundle in the existing vault. No password persistence. Keep Enterprise disabled by default so users without an account can still start other clients; explicit enablement launches a locked service until credentials exist. Root model tool scope stays unchanged.

Reject redirects for JSON/auth calls. Snapshot downloads follow one validated HTTPS provider redirect without forwarding Authorization. Bound bytes/time, honor cancellation/backpressure, and never return presigned URLs in MCP or receipts. Transfers require an explicit library/CLI request, not automatic startup.
