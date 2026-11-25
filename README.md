# foosball-matchmaker

Foosball matchmaking web app built with **TypeScript + React + Emotion + Firebase** and runnable with **Deno tasks**.

## Features

- Google authentication
- Light and dark theme: follows the device, with a switch at the foot of the page to pin
  either (`src/theme.ts`). All colours are CSS variables in `src/ui.tsx`, with one block
  of dark values; components never name a colour directly
- Admin-only table creation with auto-generated 6-character table codes
- Admin-only "who gets pinged" list per table (`api/members.ts`): everyone registered on
  the table and whether a device of theirs is signed up for push. Only the server can see
  both, and it answers only for accounts in the `admins` collection. Admins can remove a
  player from the table there
- Leaving a table: players can leave from the link at the bottom of the page. Leaving or
  being removed flags the player's `tableMembers` record (`removed: true`) rather than
  deleting it, so the app stops re-registering them when it reopens on that table; it
  only affects that one table, and joining again by code (or the Rejoin button) clears it
- QR code per table (`?table=ABC123`) for quick join flow
- Register on table and receive browser notifications when a new matchmaking session starts
- iPhone and iPad: iOS only delivers web push to a site added to the home screen, so
  `public/manifest.json` and the PNG icons make the app installable there, and a hint
  (`src/platform.ts`, `InstallPrompt`) walks iOS users through it. Nothing else sees the
  hint. The manifest has no `start_url` on purpose: the installed app opens at the address
  it was added from, which carries the table. Untested on a real device
- Start a new matchmaking session or join active one
- Enforces one new session start per table every 10 minutes
- Elo ratings, computed in the browser from the scored matches (`src/ratings.ts`): one
  rating per player across all tables, a leaderboard per table, personal statistics, and
  ratings in the queue and match history
- Balanced 2v2 teams (`src/teams.ts`): when a match fills, its four players are split into
  the two sides with the closest combined rating, front and back go to whoever is due a
  turn there, and the teams are stored on the session so they can't shift mid-game
- Any player in a match can log its score or cancel it, for an hour after it started;
  players are nudged by push if no score is in 15 minutes after the match filled
- Match commentary (`src/commentary.ts`): every scored match gets one line ("Nora's first
  win. Remember the date."), worked out from the results and shown in the match history,
  on the result card and in the Slack result post. 85 wordings across 13 kinds of remark,
  used in rotation
- Team names (`src/teamNames.ts`): each 2v2 gets two made-up names from a catalogue of
  over 600, derived from the match id so the app and Slack agree without storing them
- Slack's "Jump in" button joins the match in one tap: its link carries `join=<time the
  post went out>`, and the app, opened through it by a signed-in player, joins the match
  that post was for. The flag is dropped from the address at once, goes stale when the
  match can no longer be filling, and never joins a different match
- Slack posts carry the players' ratings: on start and join, in the lineup when a match
  fills (with team averages), and as the change each player's rating took from a result
- Weekly Slack recap per table (`api/recap.ts`, run by the Vercel cron in `vercel.json`
  every Monday 07:00 UTC): games played, most active player, biggest climber, upset of the
  week and the top of the leaderboard. A week without a scored game gets a short invitation
  to play instead, until nobody on the table has played for 60 days. Setting
  `CRON_SECRET` in Vercel is optional; when set, only the cron can call the endpoint

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
