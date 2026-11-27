# Rhythmeta dashboard

Account management at **dash.rhythmeta.org**, shared by maimaid and chunithmd. Next.js static export deployed to Cloudflare Workers Static Assets.

Includes OPAQUE/bcrypt login, email verification/reset, TOTP/passkeys/recovery codes, per-game community aliases, backup download/deletion, the OAuth developer platform (application registration and administrator review, user authorization management) and administrator account management. Personal scores and profiles live in the native apps and R2 snapshots.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm build
```

Configuration: `NEXT_PUBLIC_BACKEND_URL` defaults to `https://api.rhythmeta.org`; `NEXT_PUBLIC_MAIMAID_STATIC_URL` and `NEXT_PUBLIC_CHUNITHMD_STATIC_URL` supply each game's `community-index.json`. No secret belongs in a `NEXT_PUBLIC_*` variable.

App login requires a registered client ID, exact callback URI, random state and an S256 PKCE challenge. It returns a one-use authorization code to the app. Public backup links use no-referrer handling.

## OAuth developer platform

The **开发者** tab lets any signed-in account register an application (icon, name, website, description, callback URIs or the device-code flow without callbacks, and scopes) and shows its review status and client credentials. Administrators review pending applications there with an optional note. The **账号 → OAuth 应用** tab lists granted applications with their scopes, authorization date, last use, per-game profile restrictions and a revoke action.

Third-party applications use `GET/POST https://api.rhythmeta.org/oauth/v1/authorize`, `POST /oauth/v1/token` (authorization code with S256 PKCE, rotating refresh tokens), `GET /oauth/v1/userinfo` and scope-gated `GET/PUT /oauth/v1/backup/{game}/latest`. The consent screen lives at `/oauth/authorize`; it is a real static route (`src/app/oauth/authorize/page.tsx`) that boots the same SPA shell, so static hosting must serve `authorize.html` for it (the default `auto-trailing-slash` behaviour does). Consent is approved against the signed-in account session; the dashboard re-validates the callback target before redirecting and refuses unsafe schemes. Backup `settings` and third-party service links, credentials and identifiers are never exposed by the API.

Apps can also be registered without callback URIs and use the device authorization grant (RFC 8628). The app calls `POST /oauth/v1/device_authorization`, shows the returned `user_code` to the user, and polls `POST /oauth/v1/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code` until the code is approved, denied or expired. Users confirm at `/oauth/device`, another real static route (`src/app/oauth/device/page.tsx`), so static hosting must serve `device.html` for it (the default `auto-trailing-slash` behaviour does). `GET /oauth/v1/device/verify` renders the app, its scopes and per-game profile restrictions, `POST /oauth/v1/device/authorize` records the decision, and a `?user_code=` query parameter is prefilled then stripped from the address bar once the code has been verified.

Deploy with `pnpm deploy` or the manually dispatched workflow. Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` repository or organization secrets. The static Worker is `rhythmeta-dashboard`; configure its custom domain in `wrangler.jsonc`. Client-side CORS/CSP and the backend passkey origin must agree with the deployed domain.

## Collection snapshot links

`https://dash.rhythmeta.org/collection/MMD2.…` opens a public maimaid collection preview without signing in. The browser decodes the protobuf + raw-DEFLATE snapshot locally and uses the maimaid community index for song labels and covers. UUID/cloud collection lookup and MMD1 are unsupported. The Open in maimaid button forwards the same snapshot through `maimaid://collection/…`.

Keep Workers Static Assets `not_found_handling: single-page-application`: dynamic collection paths use the exported root shell and are selected client-side before account initialization. Deploy this dashboard alongside clients that generate the new domain. Run parser regressions with `node --test tests/song-collection-codec.test.mjs`.
