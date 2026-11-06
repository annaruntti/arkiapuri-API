# Environment variables (local → staging → production)

This document matches the current Arkiapuri API (`arkiapuri-API`) and Expo client (`arkiapuri`).  
Copy [`.env.example`](../.env.example) to `.env` locally. **Do not commit real values.**

Target production shape (example):

| Surface | Host |
|---------|------|
| API | `https://api.arkiapuri.fi` |
| Web app | `https://app.arkiapuri.fi` |
| Native deep link | `arkiapuri://…` (later: Universal / App Links on `app.arkiapuri.fi`) |

---

## Principles

1. **Secrets live in the host secret store** (AWS Secrets Manager / SSM, Railway Variables, EAS Secrets) — not in git, not baked into Docker images as build-args.
2. **Separate values per environment** (`development` / `staging` / `production`): different MongoDB, JWT secret, OAuth clients, Cloudinary, SMTP.
3. **Client may only ship public config** (API base URL). Never put `JWT_SECRET`, OAuth client secrets, SMTP, Cloudinary secret, or Gemini keys in the Expo bundle.
4. In production, `AI_GRANT_PREMIUM=true` **crashes startup** by design.

---

## Variable matrix

Legend: **R** = required · **S** = secret · **P** = public / non-secret

| Variable | Local | Staging | Production (`api` / `app.arkiapuri.fi`) | Notes |
|----------|-------|---------|------------------------------------------|-------|
| `NODE_ENV` | `development` | `production` or `staging` | `production` **R** | Enables prod CORS, compression, cookie `secure` |
| `PORT` | `3000` | host default | host default | Railway/AWS usually inject `PORT` |
| `APP_URL` | `http://localhost:3000` | `https://api-staging…` | `https://api.arkiapuri.fi` **R** | Must match Google/Apple/Facebook **authorized redirect** base |
| `CORS_ORIGIN` | `http://localhost:8081` | staging web origin(s) | `https://app.arkiapuri.fi` **R** | Comma-separated list OK |
| `MONGODB_URI` | local/Atlas dev **S** | Atlas staging **S** | Atlas/AWS prod **S R** | Never share prod DB with local |
| `JWT_SECRET` | ≥32 chars **S R** | different ≥32 **S R** | different ≥32 **S R** | `openssl rand -hex 32`; rotating logs everyone out |
| `MOBILE_REDIRECT_URI` | `arkiapuri://auth/callback` | same or staging scheme | `arkiapuri://auth/callback` | Later: `https://app.arkiapuri.fi/auth/callback` with App Links |
| `WEB_REDIRECT_URI` | `http://localhost:8081/AuthCallback` | staging web callback | `https://app.arkiapuri.fi/AuthCallback` **R** | OAuth returns `?code=` here |
| `WEB_URL` | `http://localhost:8081` | staging web | `https://app.arkiapuri.fi` **R** | Invite / email-verify / reset links |
| `FRONTEND_URL` | `arkiapuri://` | same | `arkiapuri://` | Native invite deep links |
| `GOOGLE_CLIENT_ID` | dev web client **P** | staging client | prod web client **R** | Also used as ID-token audience |
| `GOOGLE_CLIENT_SECRET` | dev **S** | staging **S** | prod **S R** | Server only |
| `GOOGLE_IOS_CLIENT_ID` | optional | optional | iOS client ID | Extra audience for native ID tokens |
| `GOOGLE_ANDROID_CLIENT_ID` | optional | optional | Android client ID | Extra audience |
| `APPLE_CLIENT_ID` / `APPLE_SERVICE_ID` | optional | staging | prod Service ID | |
| `APPLE_CLIENT_SECRET` | **S** | **S** | **S** | JWT you generate; rotates |
| `FACEBOOK_APP_ID` | optional | staging | prod | |
| `FACEBOOK_APP_SECRET` | **S** | **S** | **S** | |
| `CLOUDINARY_*` | dev cloud **S** | staging **S** | prod **S R** | Prefer separate cloud/folder per env |
| `EMAIL_*` | optional locally | real mailbox staging | real mailbox **S R** | Gmail app password or SMTP |
| `GEMINI_API_KEY` | optional **S** | staging **S** | prod **S** | Or `GOOGLE_API_KEY` |
| `AI_GRANT_PREMIUM` | `true` OK for personal QA | `false` | **`false` only** | `true` + `NODE_ENV=production` → exit |
| `AI_MODEL` / credit / budget vars | defaults OK | tune | tune | Non-secret tuning knobs |

### Client (Expo) — public only

| Variable / config | Local | Staging | Production |
|-------------------|-------|---------|------------|
| `EXPO_PUBLIC_API_URL` | unset → `environment.js` LAN/localhost | `https://api-staging…` | `https://api.arkiapuri.fi` |
| OAuth client IDs in native apps | via Google/Apple consoles | separate or shared carefully | prod apps + package / bundle IDs |

See `.env.example` in the sibling **arkiapuri** Expo repo.

---

## OAuth console checklist for `app.arkiapuri.fi`

When you cut over from Railway / localhost:

**Google**
- Authorized JavaScript origins: `https://app.arkiapuri.fi`
- Authorized redirect URIs: `https://api.arkiapuri.fi/auth/google/callback`
- Keep separate iOS/Android OAuth clients if using native Google Sign-In later

**Apple**
- Return URL: `https://api.arkiapuri.fi/auth/apple/callback`
- Domains: `api.arkiapuri.fi`, `app.arkiapuri.fi` as required by Apple

**Facebook**
- Valid OAuth redirect: `https://api.arkiapuri.fi/auth/facebook/callback`
- App domains / site URL: `app.arkiapuri.fi`

---

## How to store secrets in production

### AWS (likely prod)

| Approach | Use for |
|----------|---------|
| **Secrets Manager** or **SSM Parameter Store** (SecureString) | `JWT_SECRET`, `MONGODB_URI`, OAuth secrets, SMTP, Cloudinary, Gemini |
| **ECS task definition / App Runner / Elastic Beanstalk env** | Non-secret: `NODE_ENV`, `APP_URL`, `CORS_ORIGIN`, redirect URIs, AI tuning |
| **Inject at runtime** | Task starts → AWS SDK or platform maps secrets → `process.env` |
| **Do not** | Put secrets in Dockerfile `ENV`, `docker build --build-arg`, or AMI |

Suggested secret name layout:

```text
arkiapuri/prod/api/MONGODB_URI
arkiapuri/prod/api/JWT_SECRET
arkiapuri/prod/api/GOOGLE_CLIENT_SECRET
…
arkiapuri/staging/api/…
```

### Railway (experiments / early staging)

- Project → Variables (mark sensitive).
- Different Railway environments or projects for staging vs prod.
- Redeploy after secret change.

### Expo / EAS (client builds)

- `eas secret:create` for anything build-time (still **no** API secrets in the app).
- Production profile: `EXPO_PUBLIC_API_URL=https://api.arkiapuri.fi`
- Android release keystore: `ARKIAPURI_RELEASE_STORE_*` (already wired in `android/app/build.gradle`) via EAS credentials — never commit the keystore.

---

## Local workflow

```bash
# API
cp .env.example .env
# fill secrets, then:
npm run check-env   # if used
npm run dev

# Client (sibling repo)
cp .env.example .env
# optional: EXPO_PUBLIC_API_URL=http://192.168.x.x:3000 for device
```

Staging should mirror production URLs/HTTPS as closely as possible (real TLS, real OAuth redirect URIs).

---

## Cutover from Railway → AWS

1. Provision prod Mongo (Atlas is fine even on AWS app hosting).
2. Create Secrets Manager entries from a filled prod checklist (never from a committed file).
3. Deploy API with `APP_URL=https://api.arkiapuri.fi`, `CORS_ORIGIN=https://app.arkiapuri.fi`, redirect URIs updated.
4. Update OAuth provider consoles (remove Railway callback URLs when done).
5. Point client `EXPO_PUBLIC_API_URL` / `environment.js` production entry to the new API.
6. Rotate `JWT_SECRET` once if the old value ever lived in Railway logs or a shared chat.
7. Confirm `AI_GRANT_PREMIUM` is unset/`false` and `/health` is green.
