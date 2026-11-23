# foosball-matchmaker

Foosball matchmaking web app built with **TypeScript + React + Emotion + Firebase** and runnable with **Deno tasks**.

## Features

- Google authentication
- Admin-only table creation with auto-generated 6-character table codes
- QR code per table (`?table=ABC123`) for quick join flow
- Register on table and receive browser notifications when a new matchmaking session starts
- Start a new matchmaking session or join active one
- Enforces one new session start per table every 10 minutes
- Elo ratings, computed in the browser from the scored matches (`src/ratings.ts`): one
  rating per player across all tables, a leaderboard per table, personal statistics, and
  ratings in the queue and match history

## Setup

1. Create a Firebase project and enable:
   - Authentication (Google provider)
   - Cloud Firestore
2. Add at least one admin user by creating `admins/{uid}` document in Firestore.
3. Copy `.env.example` to `.env.local` and fill values.
4. Set `VITE_ADMIN_EMAILS` to comma-separated admin emails.

```bash
# npm install is needed once to resolve npm:* packages used by Deno tasks
npm install

deno task dev
```

## Environment variables

Create `.env.local`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_ADMIN_EMAILS=admin@example.com
VITE_QR_SERVICE_URL=https://api.qrserver.com/v1/create-qr-code/
```

## Slack `/foos` command

`api/slack.ts` answers the slash command with a private (ephemeral) message containing a
**Start a game** button; clicking it opens the app in the browser. `/foos ABC123` deep-links
straight into that table, `/foos` on its own opens the app with the last table remembered
on that device.

1. Create a Slack app at <https://api.slack.com/apps> → **From scratch**.
2. **Slash Commands** → **Create New Command**:
   - Command: `/foos`
   - Request URL: `https://<your-deployment>/api/slack`
   - Usage hint: `[table code]`
3. Install the app to the workspace.
4. Set the serverless env vars (Vercel → Settings → Environment Variables):
   - `SLACK_SIGNING_SECRET` — from the app's **Basic Information** page
   - `ALLOWED_ORIGIN` — the app's public URL, e.g. `https://foosball-matchmaker.web.app`

Requests are rejected unless they carry a valid Slack HMAC-SHA256 signature that is less
than five minutes old.

## Firestore collections used

- `tables`
- `tableMembers`
- `sessions`
- `sessionJoins`
- `pushTokens` (one document per device registered for Web Push)
- `tableIntegrations` (per-table Slack webhook, admin-only)
- `notifications` (legacy: no longer written or read, rules kept for cached older clients)
- `admins` (admin UID documents)

Security rules are provided in `/firestore.rules` and recommended indexes in
`/firestore.indexes.json`.

## Commands

```bash
deno task dev
deno task build
deno task test
```

## Firebase Hosting

The project is configured for [Firebase Hosting](https://firebase.google.com/docs/hosting).

### First-time setup

1. Install the Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```
2. Log in to Firebase:
   ```bash
   firebase login
   ```
3. Set your Firebase project ID in `.firebaserc`:
   ```json
   {
     "projects": {
       "default": "your-actual-project-id"
     }
   }
   ```

### Deploy

```bash
deno task build   # or: npm run build
firebase deploy
```

The `firebase.json` file points to the `dist` folder produced by the build step and
configures all routes to be handled by `index.html` (required for client-side routing).
