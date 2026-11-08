# SyncSaint 😇

**S**potify → **T**IDAL sync. St. Sync. SyncSaint.

Keeps TIDAL playlists automatically mirrored from Spotify playlists, including playlists that
belong to _other people_, on a schedule in GitHub Actions. No servers or databases to run.

## How it works

```
 Playlist owner                     You (admin)                       GitHub Actions (hourly)
 ──────────────                     ───────────                       ───────────────────────
 Opens SyncSaint web app  ──►  receives sealed link code  ──►  "Add link" workflow unseals it,
 signs in to Spotify,           (text / email)                  stores owner's refresh token in
 ticks playlists                                                encrypted state, creates TIDAL
                                                                playlists
                                                                        │
                                                                "Sync" workflow: for each playlist,
                                                                read tracks with the owner's token,
                                                                match on TIDAL by ISRC, add/remove
```

Since February 2026, Spotify Development Mode apps can only read tracks from playlists the
signed-in user **owns or collaborates on**. So SyncSaint reads each playlist with its owner's
own token. That's why owners sign in once.

| Piece           | Tech                                            | Where                    |
| --------------- | ----------------------------------------------- | ------------------------ |
| `apps/web`      | React 19 · TypeScript · Tailwind v4 · Vite      | GitHub Pages             |
| `apps/sync`     | Node (tsx) CLI: `sync`, `add-link`, `keygen`    | GitHub Actions           |
| `packages/core` | API clients, crypto, zod schemas, diff (shared) | —                        |
| State           | One AES-256-GCM encrypted JSON file             | `syncsaint-state` branch |

## Security model

- **No client secrets.** Both Spotify and TIDAL use OAuth Authorization Code + **PKCE**, so
  nothing secret ships in the web app.
- **Tokens never travel in plaintext.** The web app _seals_ each refresh token in the browser
  (ECDH P-256 → HKDF → AES-256-GCM) to SyncSaint's public key. Only the Actions runner holds the
  private key. Link codes expire after 14 days.
- **State is encrypted at rest.** Refresh tokens and playlist mappings live in a single
  encrypted file on the `syncsaint-state` branch. Without the `SYNCSAINT_STATE_KEY` secret it's noise.
- **Logs are scrubbed.** Every token is registered with `::add-mask::` as soon as it's loaded,
  and run summaries show only truncated IDs and counts, no playlist or track names.
- **Least privilege.** Owners grant read-only playlist scopes. Workflows declare minimal
  `permissions`, actions are pinned to commit SHAs, and Dependabot keeps them current.
- **Hardened page.** A strict Content-Security-Policy allows connections only to the
  Spotify/TIDAL auth and API hosts. No referrer, and no analytics or third-party scripts.
- **Serialized writes.** Sync and Add-link share a concurrency group, so a rotated refresh token
  is never lost to a race. State is written atomically and saved even when a run partly fails.

## Setup

### 1. Register the apps

**Spotify** (developer.spotify.com/dashboard → Create app → _Web API_)

- Redirect URIs: `https://<you>.github.io/SyncSaint/` and `http://127.0.0.1:5173/`
- Note the **Client ID** (no secret needed).
- Your account must have **Spotify Premium** (Development Mode requirement).
- **User Management:** add each playlist owner's name and Spotify email (max 5).

**TIDAL** (developer.tidal.com → Dashboard → Create app)

- Redirect URIs: same two as above.
- Scopes: `playlists.read`, `playlists.write`, `user.read`.
- Note the **Client ID**.

### 2. Configure the repo

```sh
npm install
npm run keygen -- --repo <you>/SyncSaint   # writes the keys straight into GitHub; never printed
gh variable set SPOTIFY_CLIENT_ID --repo <you>/SyncSaint
gh variable set TIDAL_CLIENT_ID   --repo <you>/SyncSaint
gh variable set ADMIN_NAME        --repo <you>/SyncSaint   # shown to owners, e.g. "Dan"
```

Then enable Pages (_Settings → Pages → Source: GitHub Actions_) and run the **Deploy web app**
workflow.

| Name                     | Kind     | Purpose                                    |
| ------------------------ | -------- | ------------------------------------------ |
| `SYNCSAINT_PRIVATE_KEY`  | secret   | Opens link codes                           |
| `SYNCSAINT_STATE_KEY`    | secret   | Encrypts the state file                    |
| `SEAL_PUBLIC_KEY`        | variable | Lets the web app seal link codes           |
| `SPOTIFY_CLIENT_ID`      | variable | Public OAuth client ID                     |
| `TIDAL_CLIENT_ID`        | variable | Public OAuth client ID                     |
| `ADMIN_NAME`             | variable | Display name on the owner page             |
| `STATE_REPO` (optional)  | variable | Keep state in another (private) repo       |
| `STATE_REPO_TOKEN` (opt) | secret   | Fine-grained PAT with contents:write on it |

### 3. Connect TIDAL (once)

Open `https://<you>.github.io/SyncSaint/#/tidal`, sign in, copy the code, then run
**Actions → Add link** and paste it.

### 4. Add playlist owners

Add them in the Spotify dashboard first, then send them `https://<you>.github.io/SyncSaint/`.
They sign in, tick playlists, and send you the code. Run **Add link** with it. Their playlists
appear on your TIDAL account and fill on the next hourly **Sync** (or run it manually).

## Behaviour and limits

- **One-way mirror.** The TIDAL playlist is overwritten to match Spotify, so manual edits on
  TIDAL get reverted. New tracks are appended; reordering isn't mirrored yet.
- **ISRC matching only, for now.** Tracks with no TIDAL match are recorded as `unmatched` in
  state and retried weekly.
- **Cheap when idle.** Each run compares Spotify's `snapshot_id` first and skips unchanged
  playlists.
- **At most 5 owners**, per Spotify Development Mode.
- **Revocation.** Owners can revoke at spotify.com/account/apps. SyncSaint marks them `revoked`,
  and the Sync run fails visibly until you re-link or disable them.
- **Inactive repos.** On public repos, GitHub disables scheduled workflows after 60 days without
  activity. Re-enable the Sync workflow if that happens.

## Development

```sh
npm install
cp apps/web/.env.example apps/web/.env.local   # fill in client IDs + SEAL_PUBLIC_KEY
npm run dev        # http://127.0.0.1:5173 (Spotify rejects "localhost")
npm test           # vitest
npm run lint && npm run typecheck
```
