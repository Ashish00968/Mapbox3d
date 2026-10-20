# Security

## Mapbox token handling

Mapbox Video Studio is a static client-side application with no build step and no
server component. The Mapbox GL access token it uses must be present in client code
that ships to the browser. This document explains how that token is scoped, why its
exposure is acceptable, and the steps required to keep a deployed token safe.

### The client token is public-scoped (`pk.*`)

The token used by the Studio is a **public** Mapbox access token (the `pk.*` prefix).
Public tokens are designed to be embedded in client-side code. Because this is a
static app served directly to the browser, there is no secure place to hide the
token — any token the browser uses to authenticate map requests is, by definition,
visible to anyone who inspects the page. This exposure is unavoidable and expected
for a static client app.

### Never ship a secret-scoped token (`sk.*`)

A secret-scoped token (the `sk.*` prefix) grants account-management privileges and
**MUST NEVER** appear anywhere in client code, in this repository, or in any deployed
artifact. Secret tokens belong only in trusted server environments. If you ever find
an `sk.*` value in client code, treat it as a leaked credential: rotate it in the
Mapbox dashboard immediately and remove it from the codebase and history.

### Restrict the deployed token with a URL allowlist

Because the public token is visible to anyone, the deployed token **MUST** be
restricted with a URL allowlist configured in your Mapbox account so it can only be
used from your own domains. This prevents others from copying the token and consuming
your Mapbox quota.

To configure the URL allowlist:

1. Sign in at [account.mapbox.com](https://account.mapbox.com).
2. Open the **Tokens** page.
3. Select the public token used by the deployed Studio (or create a dedicated one).
4. Under **URL restrictions**, add an allowlist entry for each domain the Studio is
   served from (for example, `https://your-domain.example` and any staging domains).
5. Save the token. Mapbox will reject requests that use the token from any origin not
   on the allowlist.

Keep the allowlist limited to the domains you actually deploy to, and review it when
domains change.

## Token centralization

The Mapbox token is defined in a single place: `js/store.js`, as
`STUDIO_CONFIG.mapboxToken`, and is read through the `getMapboxToken()` accessor. All
subsystems obtain the token from this centralized source rather than hardcoding it.
When rotating or restricting the token, update it only in `js/store.js`.
