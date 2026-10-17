# Emailing an STL or 3MF

Lumiphane can email the generated lithophane to an address the visitor types. The browser builds the file. The server sends it with [Resend](https://resend.com) and does not store the file or the address.

## Environment

Put these in the server environment (`.env` next to `package.json` for `npm run dev` and `npm start`). Copy the names from `.env.example`.

```bash
RESEND_API_KEY="re_your_real_key"
EMAIL_FROM="Lumiphane <exports@lumiphane.com>"
```

`RESEND_API_KEY` is read only by the Node server. Do not prefix it with `VITE_`. A `VITE_` variable is compiled into the browser bundle. Leave the key empty, or set a placeholder, to hide **Send to my email**. The key must look like a real Resend key (`re_` plus at least 16 characters, not a string of `x`s).

`EMAIL_FROM` is the From line. It defaults to `Lumiphane <exports@lumiphane.com>` when unset. The address has to be on a domain you have verified in Resend, or Resend will refuse the send (the sandbox `onboarding@resend.dev` can only deliver to the address on the Resend account).

Create the key at <https://resend.com/api-keys>. A sending key is enough.

### Domain

1. Add the domain in the Resend dashboard (for the default sender, `lumiphane.com`).
2. Publish the SPF, DKIM, and DMARC records Resend shows.
3. Turn off open and click tracking on that domain. This mail is a file the person just requested, and tracking pixels hurt delivery.
4. Use a real mailbox, not `noreply`. Replies to `exports@lumiphane.com` should reach someone, or change `EMAIL_FROM` to a mailbox you read.

New domains should start with a low volume. Resend's first-day guidance is on the order of 150 messages for a new domain.

## What the visitor sees

**Export** in the header is the only export control. It opens one menu:

- Download the selected file (Bambu Studio 3MF, standard 3MF, or STL). On iPhone this still uses the system share sheet, including the extra tap after a slow 3MF build, so Safari does not reload or crash.
- **Send to my email**, when the server says email is configured. The attachment is 3MF by default (the Bambu project when that format is selected, otherwise a standard 3MF) or STL.
- **Order a print**, when Treatstock is configured. See [print-ordering.md](print-ordering.md).

`GET /api/email-export/status` returns `{ "enabled": true }` or `{ "enabled": false }`. A missing key, a failed status check, or a network error hides the email section. The same pattern hides Order a print when `GET /api/print-order/status` says ordering is off.

## Request

`POST /api/email-export`

| Header | Value |
| --- | --- |
| `Content-Type` | `application/octet-stream` |
| `X-Recipient-Email` | One address |
| `X-Export-Format` | `stl` or `3mf` |
| `X-Model-Filename` | Suggested name. The server sanitizes it and forces the extension. |
| `X-Idempotency-Key` | Optional. Retries of the same send reuse it so Resend does not deliver twice. |

The body is the raw file. STL must be a binary STL. 3MF must be a ZIP (`PK`). The message is one HTML part plus a plain-text part. The file is the only attachment.

Each IP can send 5 emails per 15 minutes. Behind a reverse proxy, the server trusts `X-Forwarded-For` only when the socket itself is loopback or private. A public client cannot rotate that header to dodge the limit. The response is `429` with `Retry-After` when the limit is hit.

Resend's limit is about 40 MB for the whole message after the attachment is base64-encoded. The server keeps 64 KB for the message body and accepts a file of at most `floor((40 MiB - 64 KiB) / 4) * 3` bytes (about 30 MB). The Express body parser uses that same ceiling, and a larger upload returns `413` with an explanation. Download still works for models that are too big to email.

The server does not log the recipient address. It logs the Resend message id, the format, and the size. API errors are redacted before they are logged, and they are not returned to the browser.

## Running in production

Do not commit `.env` or a real API key. The app is a static site plus this Node process.

On the server, after the project files are in place:

```bash
npm ci
npm run build
npm start
```

`npm start` runs `tsx server/index.ts`. `tsx` is a runtime dependency, so a production `npm ci` still installs it. The process listens on `PORT` (default **3000**) and `HOST` (default **0.0.0.0**). It serves `dist/` and the API on the same port.

`.npmrc` sets `legacy-peer-deps=true` so `npm ci` can resolve Vite's optional esbuild range.

Required at runtime:

| Path | Why |
| --- | --- |
| `dist/` | Built UI from `npm run build` |
| `server/` | API, including `server/index.ts`, `server/app.ts`, `server/emailExportRouter.ts`, `server/printOrderRouter.ts` |
| `src/services/emailExport.ts` | Email validation and the message body, imported by the API |
| `src/services/printOrder.ts` | Treatstock helpers and the STL check, imported by the API |
| `package.json` | Scripts and dependencies |
| `package-lock.json` | Locked installs for `npm ci` |
| `.npmrc` | Peer-dependency setting used by `npm ci` |
| `node_modules/` | Installed by `npm ci` on the server |
| `.env` | Created on the server. Not in git. |

`npm run build` needs the rest of the frontend source (and `blank-profile.3mf`) on the machine that builds. The simplest deploy is to upload the repository without `node_modules` and without `.env`, create `.env` on the server, then run the three commands above.

Environment the process reads:

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Only to show and send email | Resend secret. Never `VITE_`-prefixed. |
| `EMAIL_FROM` | No | Sender. Defaults to `Lumiphane <exports@lumiphane.com>`. |
| `TREATSTOCK_PRIVATE_KEY` | Only to show Order a print | See print-ordering.md. |
| `TREATSTOCK_DEFAULT_COUNTRY` | No | Quote country when the visitor IP is private. Default `US`. |
| `PORT` | No | Default `3000`. |
| `HOST` | No | Default `0.0.0.0`. |

Development is `npm run dev` (Vite on port 3000). The same API routes are mounted inside the Vite process and read the same `.env`.

There is no separate email worker. Sending happens inside the request. A reverse proxy in front of port 3000 must allow request bodies of at least 30 MB (`client_max_body_size` on nginx, for example) or large models will fail before Express can explain the limit.
