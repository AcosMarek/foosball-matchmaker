# foosball-matchmaker

Foosball matchmaking web app built with **TypeScript + React + Emotion + Firebase** and runnable with **Deno tasks**.

## Features

- Google authentication
- Admin-only table creation with auto-generated 6-character table codes
- QR code per table (`?table=ABC123`) for quick join flow
- Register on table and receive browser notifications when a new matchmaking session starts
- Start a new matchmaking session or join active one
- Enforces one new session start per table every 10 minutes

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

## Firestore collections used

- `tables`
- `tableMembers`
- `sessions`
- `sessionJoins`
- `notifications`
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
