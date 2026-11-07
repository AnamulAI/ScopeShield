# ScopeShield

ScopeShield helps freelancers and small agencies catch scope creep: paste the agreed scope and a client thread, and it finds requests outside the contract, checks whether the client agreed to pay, and drafts a change order.

**Status:** work in progress, built for the Clocked Build Challenge. Full README coming.

Built by Mohammad Anamul Hoque (AnamDev) with AI-assisted development (Claude Code).

## Deploy (Cloudflare Pages)

The app is a static Vite build plus Pages Functions (`functions/api/clocked/[endpoint].ts`, the proxy that holds the API key). You need a Clocked API key and a Cloudflare account.

### Path A: Wrangler direct upload (what the live site uses)

```bash
npm ci && npm run build
npx wrangler login
npx wrangler pages project create scopeshield --production-branch main
npx wrangler kv namespace create RATE_LIMIT      # paste the printed id into wrangler.toml
npx wrangler pages secret put CLOCKED_API_KEY --project-name scopeshield   # paste the key at the prompt
npx wrangler pages deploy dist --project-name scopeshield --branch main
```

Notes:
- If the project name is taken, pick another one and use it in the secret and deploy commands.
- Secrets are read by deployments created after you set them, so run the deploy command again after `secret put`.
- The `RATE_LIMIT` KV binding is required on any non-localhost host: the proxy refuses live requests without it. It enforces 80 Clocked calls per IP and 2,000 per site per UTC day. KV is not atomic, so the caps are approximate, and the free KV plan limits writes per day, which lowers the effective cap (when KV cannot be written, the proxy refuses requests instead of allowing unlimited use).
- Demo mode needs no key and makes no API calls.

### Path B: Git-connected Pages (alternative)

1. In the Cloudflare dashboard: Workers & Pages, Create, Pages, Connect to Git, pick this repository.
2. Build command `npm run build`, output directory `dist`, production branch `main`.
3. Settings, Variables and Secrets: add the secret `CLOCKED_API_KEY`. Settings, Bindings: add a KV namespace binding named `RATE_LIMIT`.
4. Redeploy. Pushes to `main` now deploy automatically.

### Local development

```bash
cp .dev.vars.example .dev.vars    # then put your key in .dev.vars (never commit it)
npm ci
npm run pages:dev                 # http://localhost:8788 (builds, then runs Pages + Functions)
```
