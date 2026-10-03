# Rhythmeta dashboard

Account management at **dash.rhythmeta.org**, shared by maimaid and chunithmd. Next.js static export deployed to Cloudflare Workers Static Assets.

Includes OPAQUE/bcrypt login, email verification/reset, TOTP/passkeys/recovery codes, per-game community aliases, backup download/deletion and administrator account management. Personal scores and profiles live in the native apps and R2 snapshots.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm build
```

Configuration: `NEXT_PUBLIC_BACKEND_URL` defaults to `https://api.rhythmeta.org`; `NEXT_PUBLIC_MAIMAID_STATIC_URL` and `NEXT_PUBLIC_CHUNITHMD_STATIC_URL` supply each game's `community-index.json`. No secret belongs in a `NEXT_PUBLIC_*` variable.

App login requires a registered client ID, exact callback URI, random state and an S256 PKCE challenge. It returns a one-use authorization code to the app. Public backup links use no-referrer handling.

Deploy with `pnpm deploy` or the manually dispatched workflow. Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` repository or organization secrets. The static Worker is `rhythmeta-dashboard`; configure its custom domain in `wrangler.jsonc`. Client-side CORS/CSP and the backend passkey origin must agree with the deployed domain.

## Collection snapshot links

`https://dash.rhythmeta.org/collection/MMD2.…` opens a public maimaid collection preview without signing in. The browser decodes the protobuf + raw-DEFLATE snapshot locally and uses the maimaid community index for song labels and covers. UUID/cloud collection lookup and MMD1 are unsupported. The Open in maimaid button forwards the same snapshot through `maimaid://collection/…`.

Keep Workers Static Assets `not_found_handling: single-page-application`: dynamic collection paths use the exported root shell and are selected client-side before account initialization. Deploy this dashboard alongside clients that generate the new domain. Run parser regressions with `node --test tests/song-collection-codec.test.mjs`.
