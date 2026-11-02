# Deploy Texan Flue for the owner

This guide targets **Vercel Pro + Neon PostgreSQL 17 + three private Vercel Blob stores**, with `app.texanflue.com`. The owner needs no Node, npm, Docker or PostgreSQL on their Mac. All production setup below uses websites.

**Current verification:** no Vercel/Neon accounts are connected to this environment. Deployment, domain/DNS, provider billing, SMTP and photo persistence across a real redeploy have **not** been tested live. The packaged browser, private-storage implementation, database setup, offline recovery and encrypted restore have local tests; these are not a substitute for the live checklist at the end.

This is not honestly a three-click deployment. Private storage needs connecting, authentication needs secrets, mail recovery needs a sender, and backups need GitHub secrets. All application code and workflows are committed; the human steps below are account/domain configuration and the first owner’s password. No hosted demo seed is needed or allowed.

## Monthly budget

Planning baseline for one owner: **Vercel Pro $20 per seat/month**, **Neon Launch $5/month minimum plus usage**, private Blob storage/operations/transfer metered, GitHub Actions within the account’s included minutes where available, and the existing domain’s normal renewal. Plan **at least $25/month base**, with approximately **$25–40/month** for a small operation before mail, optional AI, taxes and unusual image/backup traffic. This is a budget estimate, not a verified current quote. Official pricing sites were blocked by this environment’s network policy, so the account checkout screens must confirm current rates and included credits before purchase.

Vercel’s serverless Chromium package has no separate rendering-service subscription. Rendering consumes Vercel function CPU/memory. Blob has no separate account; it is under Vercel. Daily full encrypted file backups increase storage and reads; retain at least 30 days and watch usage. Neon can scale to zero between use; active compute and growing records add usage. An existing supported SMTP provider may add no subscription; a transactional provider’s own plan is separate. Optional Anthropic calls are additional usage and remain disabled until configured. Review current prices at [Vercel](https://vercel.com/pricing), [Blob](https://vercel.com/docs/vercel-blob/usage-and-pricing) and [Neon](https://neon.com/pricing).

## 1. Prepare the repository and accounts

1. Sign into GitHub and open `guyk856-prog/Texan-Flue-Chimney-`. If it is public, use **Settings → General → Danger Zone → Change repository visibility → Private**. Do not put customer files or secrets in GitHub.
2. Create the Vercel and Neon accounts. Use the company’s own account/email and save recovery codes in its password manager. Use Vercel Pro for this business deployment.
3. Have access to the DNS settings for `texanflue.com`. Do not change the existing website’s apex or `www` records.

## 2. Create the database

1. In Neon choose **New project**. Name it `texan-flue`; select **PostgreSQL 17** and **AWS US East (N. Virginia)**, near the app’s `iad1` region. Select the production branch and create the project.
2. Open **Connect**. With **Connection pooling ON**, copy the connection string. Save it as the future `DATABASE_URL`; append `&connection_limit=2&pool_timeout=20` if the URL already has `?sslmode=require`.
3. Turn **Connection pooling OFF** and copy the direct connection string. Save it as `DIRECT_URL`. It must not contain `-pooler` in the hostname. Do not paste either string into a support chat.
4. Under **Branches**, create a separate `preview` branch for preview/testing. Copy its pooled and direct strings too. Preview must never use production credentials or customer data.

## 3. Import the app and connect storage

1. In Vercel click **Add New → Project**, connect the GitHub repository, and select the **Next.js** framework. Use the repository root. Node version is **22.x**.
2. The committed `vercel.json` supplies `npm ci` and `npm run build:vercel`. Leave Output Directory at the Next.js default; do **not** select static export. The build applies real migrations under a dedicated database lock before compiling. It never runs the demo seed.
3. If the Vercel project must be created before adding storage, complete the import knowing the first build may stop with “Set required environment variable …”; no customer data is created. Configure the settings below, then use **Deployments → Redeploy**. A failed configuration build is not a successful launch.
4. Open the project’s **Storage** tab. Choose **Create Database/Store → Blob**, name it `texan-files`, and choose **Private** access. Connect it to the project’s **Production** environment. Vercel adds `BLOB_READ_WRITE_TOKEN`; keep it secret.
5. Create a separate private store `texan-preview-files` for **Preview**, with its own token. Never connect preview uploads to the production store.
6. Create a third private store `texan-backups` for encrypted backups. It is not used by browser uploads. Copy its read/write token only into the GitHub backup secret described later. Application and backup stores must be separate.

## 4. Enter environment variables and deploy

1. Open **Project → Settings → Environment Variables**. Use the complete [environment-variable list](docs/ENVIRONMENT.md), which marks every value required or optional and explains missing behavior.
2. For **Production**, add its `DATABASE_URL`, `DIRECT_URL`, a fresh random `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `STORAGE_DRIVER=vercel-blob`, and a different random `BOOTSTRAP_TOKEN`. The Blob integration supplies the private store token. Generate both random values using the password manager, not an example from this guide.
3. Leave `AUTH_URL` absent for the initial Vercel hostname; the app uses Vercel’s supplied production hostname. Once the custom domain is ready, set it to `https://app.texanflue.com` and redeploy. Preview automatically uses its own deployment hostname.
4. For **Preview**, use its separate Neon branch and private store. Set a different authentication secret and bootstrap code. Do not copy production data into preview to run tests.
5. Configure password recovery with `MAIL_MODE=smtp`, your provider’s `SMTP_URL`, and `MAIL_FROM` from a sender that provider has verified. Without those, login works but password-reset delivery does not; do not launch for real customer work until recovery is tested. Production does not capture reset emails on disk.
6. AI is optional. Leave its key absent to keep every AI action hidden. Do not set any secret with a `NEXT_PUBLIC_` prefix. Monitoring webhook settings are optional; without them structured server logs remain available in Vercel.
7. Click **Deploy**, or **Deployments → Redeploy** after changing settings. Expect a migration-lock message, successful migrations, a compiled Next.js app, then Vercel’s **Ready** status. If migration/configuration fails, read the named missing setting and correct it; do not run a reset or seed.

## 5. Create the owner and complete setup

1. Click Vercel’s **Visit** link and append `/setup` to its address. On an empty database the screen says **Welcome to Texan Flue**.
2. Enter the bootstrap code from the environment settings, the owner’s name/email, and their new 16–72-character password. Save the password in the password manager. Click **Create owner account**. Exactly one ADMIN is created; no demo users/customers/jobs/prices are inserted. The endpoint refuses a second owner creation.
3. Complete **Confirm company details**, **Use your company logo**, and **Review services and prices**. Keep the supplied logo or upload another supported image. Open the service library, review scope wording and enter the prices the company actually charges. No one is invited. Tax/fees/AI start disabled.
4. Review the electronic-record disclosure, seven-year retention policy, and the counsel-review Terms/Privacy drafts. Have the owner and counsel adopt the final policies before customer use; no legal status is asserted by these draft pages.
5. Click **Finish setup and open dashboard**. The clear first action is **New customer**. An ADMIN owner can assign themselves to a job, draft their own inspection and personally sign it off; they do not need a second technician account.
6. Delete `BOOTSTRAP_TOKEN` from Vercel’s settings and redeploy after verifying login. Existing accounts use login/password reset; setup will not create a second owner even if the code remains.

## 6. Connect app.texanflue.com

1. Open **Vercel → project → Settings → Domains → Add** and enter `app.texanflue.com`.
2. Vercel shows the DNS record it requires. At the existing DNS provider add **only** that record, usually a CNAME with name `app` and the target Vercel displays. Do not guess a target and do not change the existing website records.
3. Wait until Vercel shows **Valid Configuration** and HTTPS is ready. Set production `AUTH_URL=https://app.texanflue.com` and redeploy.
4. Sign in at the custom domain. HTTPS cookies must have Secure/HttpOnly/SameSite controls; forms must submit from that same origin. Share links must start with this domain. Open a share link in a private browser on the phone; it must require no staff session and expose only that exact version.

## 7. Enable nightly backups and prove recovery

1. In GitHub open **Settings → Secrets and variables → Actions → New repository secret**. Add `BACKUP_DIRECT_URL` (production unpooled URL), `BLOB_READ_WRITE_TOKEN` (production file-store token), `BACKUP_BLOB_READ_WRITE_TOKEN` (separate backup-store token), and a separately generated `BACKUP_PASSPHRASE` of at least 32 random characters. Keep an offline/password-manager copy of that passphrase.
2. In **Actions**, enable workflows if GitHub asks. Select **Nightly encrypted backup and restore verification → Run workflow**. It creates a consistent PostgreSQL snapshot, archives the private files with it, encrypts the archive and writes it to the private backup store.
3. The same job restores into a disposable PostgreSQL database and checks critical table counts, financial totals, issued-version hashes and every included file hash/size. It removes old encrypted backups only after a successful verification. Open the job summary and check it passed. A skipped or failed run is not a backup.
4. Under **Secrets and variables → Actions → Variables**, set `PRODUCTION_BACKUPS_ENABLED=true`. The schedule is daily at **08:00 UTC** (03:00 Dallas daylight time / 02:00 standard time). Enable GitHub’s workflow-failure notifications and check the first scheduled run. Keep at least 30 days; daily full-file copies add usage.

A local restore drill was actually completed in this environment: a disposable PostgreSQL instance restored the consistent snapshot, checked 19 critical table counts and financial totals, and verified 218 issued-version hashes and 297 private files. No production database was touched. Hosted backup publication and a real Neon/Blob recovery remain unverified until the accounts exist.

## 8. Roll back application code

1. In Vercel open **Deployments**, select a previously healthy deployment that supports the private Blob adapter, choose **… → Instant Rollback / Promote to Production**, and confirm the correct domain.
2. Check login, an existing document download and a photo. Rolling back code does not undo database migrations. Do not reset/drop the database or delete file stores. Do not roll back to the earlier disk-storage prototype on Vercel.
3. If there is no prior healthy hosted deployment, keep customer use paused and investigate or restore into new targets below. Do not claim a first failed deployment has a rollback target.

## 9. Restore after a database/storage incident

1. Pause customer use. In Neon create a **new empty** PostgreSQL 17 database/project and copy its direct and pooled URLs. Do not restore over the current database.
2. In Vercel create a **new empty private Blob store** and copy its token. Keep the old database/stores intact until recovery is verified.
3. In GitHub create/update the `RESTORE_DIRECT_URL` and `RESTORE_BLOB_READ_WRITE_TOKEN` secrets. Configure the optional `recovery` environment with owner review if your GitHub plan supports it.
4. Under **Actions → Recover to new empty database and private store → Run workflow**, enter the encrypted backup filename and `RESTORE TO EMPTY TARGET`. It refuses nonempty targets, decrypts the backup, restores records/files and verifies their counts/totals/hashes. A failure means do not switch the app. Wrong/missing passphrase stops recovery.
5. After **PASS**, change Vercel’s production `DATABASE_URL`, `DIRECT_URL`, and application `BLOB_READ_WRITE_TOKEN` to the recovered targets, and redeploy. Keep `AUTH_SECRET` unless intentionally signing everyone out. Check real document/receipt downloads and images before reopening.
6. Update backup secrets to the recovered source database/store and run another backup drill. Keep a record of the incident and recovery time.

The production recovery workflow is implemented but has not run against Neon/Blob. Its database/file verification mechanisms were exercised locally. Point-in-time restore in Neon’s own dashboard may also be available under the purchased plan; verify that plan’s restore window rather than assuming it.

## Live acceptance — still pending accounts

Use Preview with separate test storage/database. Do not create demo data in the production customer database.

- Owner can open the preview URL and sign in from a phone.
- Issue a three-line estimate: 9900 cents, 165000 cents and quantity 4 at 66900 cents. Download its PDF and verify **$4,425.00**, with tax/fee excluded explicitly.
- Upload an obvious test photo. Redeploy that same preview project, sign in again and verify the original/display photo and PDF still download with matching bytes. Redeploying must not recreate or seed records.
- Open a share link in a private browser, read the disclosure, sign, then verify the exact disclosure version/text and immutable PDF hash in the records.
- Request password reset through the actual mail provider, run a hosted backup/restore drill, and verify the custom domain and cookie settings.

Only after these checks should live deployment acceptance be marked complete. Local execution and a Ready build are not proof of hosted file persistence or real PDF rendering.

The verified nightly job also removes expired request buckets and upload authorizations at least 24 hours past expiry, including abandoned quarantine objects. It never deletes permanent customer evidence. This cleanup starts only when the configured backup workflow is enabled.
