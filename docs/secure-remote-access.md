# Secure remote access

## Target architecture

```text
Mobile browser
  -> https://music.mcdryad.com
  -> Cloudflare Access (Google login, explicit email allowlist)
  -> Cloudflare Tunnel
  -> Nginx 127.0.0.1:8080
  -> NestJS 127.0.0.1:4000
```

No router port forwarding is required. Keep OAuth client secrets, tunnel tokens,
and allowed email addresses outside this repository.

## 1. Preflight and backup

Run these checks on the Raspberry Pi before changing services:

```sh
cd /home/pi/workspace/node-audio-player
test -d client/build
test -d server-nestjs/dist
pm2 describe nmp
command -v ffmpeg
df -h /home/pi/workspace/node-audio-player/server-nestjs
sudo nginx -T
sudo ss -ltnp
```

The Raspberry Pi deployment may be a copied release rather than a Git checkout.
Back up the deployed source and `dist/` directory before replacing either one.

Back up the active Nginx site configuration to a root-owned file. Confirm the
repository path and update the `root` directive in
`ops/nginx/node-audio-player.conf` if the deployment is not under `/home/pi`.
Do not remove the existing public site or router rule yet.

Confirm SSH public-key login in a second terminal before disabling passwords.
Then set `PasswordAuthentication no` and `PermitRootLogin no` in
`/etc/ssh/sshd_config`, validate with `sudo sshd -t`, reload SSH, and confirm a
new key-only connection succeeds. Keep the original SSH configuration in the
deployment backup.

## 2. Build and bind the origin locally

Build both active applications. Restart PM2 only after the NestJS build passes.

```sh
cd /home/pi/workspace/node-audio-player/server-nestjs
npm ci --include=dev
mkdir -p data/audio-cache
export AUDIO_CACHE_PATH="$PWD/data/audio-cache"
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
pm2 restart nmp

cd /home/pi/workspace/node-audio-player/client
npm ci
npm test -- --watchAll=false
npm run build
```

Install the Nginx template as a separate loopback-only site, then validate and
reload Nginx. Preserve unrelated server blocks.

```sh
sudo install -m 0644 ops/nginx/node-audio-player.conf /etc/nginx/sites-available/node-audio-player
sudo ln -sfn /etc/nginx/sites-available/node-audio-player /etc/nginx/sites-enabled/node-audio-player
sudo nginx -t
sudo systemctl reload nginx
```

Verify the local origin before configuring the tunnel:

```sh
curl -fsS http://127.0.0.1:4000/api/playlists
curl -fsS http://127.0.0.1:8080/api/playlists
curl -fsSI http://127.0.0.1:8080/
sudo ss -ltnp
```

For WMA playback, URL-encode the path as one query value and verify the first
request creates the cache. The second request must reuse the same MP3 file.

```sh
curl --get --data-urlencode 'path=<RELATIVE-WMA-PATH>' \
  -H 'Range: bytes=0-1' -D - -o /dev/null \
  http://127.0.0.1:8080/api/audio
```

Expected response: `206 Partial Content`, `Content-Type: audio/mpeg`, and
`Accept-Ranges: bytes`. Keep `AUDIO_CACHE_PATH` in the PM2 environment when
restarting with `pm2 restart nmp --update-env`.

NestJS must listen only on `127.0.0.1:4000`. The new Nginx site must listen
only on `127.0.0.1:8080` and `[::1]:8080`.

## 3. Configure Google login

In Google Cloud, create an OAuth consent screen with an External audience and a
Web application OAuth client. Use only `openid`, `email`, and `profile` scopes.
Set the Cloudflare team domain as the JavaScript origin and its Access callback
URL as the authorized redirect URI.

In Cloudflare Zero Trust, add the Google identity provider with the generated
client ID and secret, enable PKCE, and run the identity-provider connection
test. Never paste the client secret into a repository file or command log.

## 4. Create Access before publishing the tunnel

Create a Self-hosted Access application for `music.mcdryad.com` before
adding the public hostname route.

- Enable Google as the only login method.
- Add one Allow policy using explicit `Emails` entries supplied by the owner.
- Set the application and policy session duration to seven days.
- Do not add email-domain, Bypass, or public Allow rules.
- Enable `Protect with Access` for the tunnel route.
- Add a Cloudflare cache rule that bypasses cache for the entire hostname.

Test the Google identity provider before exposing the hostname.

## 5. Install and publish Cloudflare Tunnel

Create a remotely managed tunnel in Cloudflare. Use the dashboard-generated
Raspberry Pi installation command to install `cloudflared` as a systemd service.
Treat the generated tunnel token as a secret and do not save it in shell scripts
or repository files.

Map the public hostname to this origin:

```text
http://127.0.0.1:8080
```

Confirm the tunnel reports Healthy and the service is persistent:

```sh
sudo systemctl is-enabled cloudflared
sudo systemctl status cloudflared --no-pager
```

## 6. Acceptance and cutover

From a smartphone on cellular data:

1. Open `https://music.mcdryad.com` in a signed-out browser and confirm
   that Cloudflare Access requires Google login.
2. Confirm an allowlisted account can load the library, search Korean and nested
   paths, create and delete a temporary playlist, play one track, and seek.
3. Confirm a non-allowlisted Google account receives an Access denial.
4. Confirm an audio Range request returns `206 Partial Content` when the source
   file supports ranges.

After all checks pass, remove only the router port-forwarding rule and public
Nginx listener used by this audio player. Preserve SSH and unrelated services.
Verify that the old public IP/port and LAN access to ports `4000` and `8080`
fail while the protected hostname still works.

## User removal

Remove the email from the Access Allow policy, then revoke that user's Access
session under Zero Trust. Confirm the removed account can no longer open the
application.

## Rollback

If the protected hostname fails before cutover, leave the old route unchanged
and disable the new tunnel route. If it fails after cutover, restore local-only
Nginx service while diagnosing the tunnel. Do not reopen an unauthenticated
public router port as an automatic rollback.
