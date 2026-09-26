# Migrating from Upstream RisuAI

> **This page is written from the removal plan and the app's source, not tested against a
> running build with a real RisuAccount.** Nobody working on this fork has an account-sync
> backup to test with, so the routes below — especially the combined route — are unverified. If
> a step here does not match what you actually see, that is more likely to be this page than
> your data.

## What this fork does not have

This fork does not have RisuAccount sign-in, and does not sync your data to RisuAccount's cloud
service. There is no login screen for it, and no "on/off" switch to turn sync back on. If you
want RisuAccount sign-in or sync, use upstream RisuAI.

This does **not** affect RisuRealm or Google Drive backup. You can still browse, download and
anonymously upload to RisuRealm, and back up to and restore from Google Drive, without signing
in to RisuAccount.

The first time you use either one, this fork asks you to accept upstream RisuAI's Terms of
Service and Privacy Policy, since Realm and Google Drive backup are services upstream
operates, not this app. Accepting once covers both. An acceptance you already gave in
upstream RisuAI itself does not carry over; this fork asks again, the first time.

## The normal route: a `.bin` local backup

For almost everyone, migrating is the same as moving between any two RisuAI installs: on
upstream, use **Settings → Account & Files → Save Backup Locally** to make a `.bin` file, then
import it here the same way you would on upstream. This works whether or not you ever used
RisuAccount sync, as long as the backup itself is not encrypted (see the next section).

## If your backup is encrypted by RisuAccount

Since upstream started encrypting full local backups made by a signed-in RisuAccount user on its
own site (`risuai.xyz`), this fork cannot read that kind of `.bin` file. Trying to import one
shows a message telling you it cannot be read, for technical reasons, and nothing is imported —
no assets, no cold storage, no database changes.

This only affects a backup made **while signed in to RisuAccount on `risuai.xyz`**. A backup made
while logged out, or from a self-hosted or locally run upstream instance, is not encrypted this
way and imports normally.

The reason is deliberate, not a bug to be fixed later: reading that kind of file would depend on
an endpoint RisuAccount's own servers control, which this fork cannot verify or rely on. Upstream
alternatives exist, described below.

## Two things you can do on upstream instead

If your backup was refused, upstream gives you two ways to get your data out, and each keeps and
drops something different:

1. **Save Partial Backup Locally (Excluding Character Assets)** (the button's own label). It is
   not encrypted, and it keeps every chat, including cold-storage chat bodies. It keeps character,
   group and persona profile images, your user icon, your background, and folder and preset
   images. It drops everything else — emotion images, additional character assets and VITS voice
   files.
2. **Logout**, then **Save Backup Locally**. This keeps the `.png` image assets a full backup
   normally carries, but loses cold-storage chat bodies (the chats that had been moved to cold
   storage stay behind).

Neither one alone gets you everything.

## Getting everything: the combined route

Doing both, and importing both here in the right order, is how you keep everything: your chats
(including cold-storage ones) and your images.

1. While still signed in, use **Save Partial Backup Locally (Excluding Character Assets)**. This
   does not require logging out.
2. **Logout** of RisuAccount, then use **Save Backup Locally** to make a full, unencrypted backup.
3. Make these two backups back to back, without using the app in between, so both capture the
   same chats.
4. Import the **Partial** backup first, then the **Full** backup second.

The order matters. Each import replaces the whole database with the one just imported — it does
not merge with what was already there. So the database you end up with is whichever backup you
imported last, which is why the Full backup, the newer of the two, goes second. What survives from
the Partial import is not its database, but the cold-storage chat bodies it already wrote to disk:
the Full import doesn't carry those itself, but it doesn't delete them either, so they are still
there afterward.

This route is read from the code, not run end to end — nobody maintaining this fork has an
account-sync backup to test it against. If you try it, treat your original data on RisuAccount as
the source of truth until you have checked the result.

## Self-hosted or local upstream: don't lose your images

If your upstream install is self-hosted or run locally (not `risuai.xyz`) and you used account
sync there, a plain **Save Backup Locally** can silently leave your images out. Upstream has a
setting, **on by default** and hidden unless **Show Unrecommended Settings** is on, that skips
writing image assets into a local backup while account-sync is active.

Before making the backup, in upstream's **Settings → Advanced Settings**:

1. Turn on **Show Unrecommended Settings**.
2. Untick **Skip Saving Assets on Web Sync**.

Then make your backup. Skipping this step means the backup you make will be missing images, with
no warning at the time.

**Do this before you replace the upstream install with this fork**, if you are upgrading in
place (the same server folder or Docker volume). Once you switch to this fork, there is no
RisuAccount sign-in left to make a fresh backup from — the `.bin` you make beforehand, while
upstream is still running, is what carries your data over.

## In-place upgrades: the stale-profile notice

You can also migrate by swapping a self-hosted upstream install for this fork on the same
origin, keeping the same `save/` folder or Docker volume. This is a supported route alongside the
`.bin` import above.

If that origin previously had account sync turned on, this fork's storage layer detects it at
startup. Turning sync on, upstream, freezes whatever data was there just before sync started —
your browser's local storage, OPFS, or the Node server's `save/` folder, depending on which one
was active at the time — and never updates it again while sync stays on. After the switch to this
fork, that is the data you would otherwise see, silently, with no sign it is out of date.

Instead, this fork shows a notice on boot: this browser profile used RisuAccount sync, which this
app does not support; what you are about to see is the data stored here from before sync was
turned on, and other browsers or devices may have changed your data since then. If what you see
might be missing something your account has, the notice tells you to make a local backup of it
before importing anything else over it. It also repeats that bringing your account's current data
here means signing in to an upstream RisuAI and making a `.bin` backup there, per the sections
above.

**Pressing OK reloads the app.** The app does not proceed past this notice on its own — it waits
for you. Your chat data is not touched by seeing the notice or pressing OK: pressing OK only
clears the sync-related flags on this browser profile, then reloads the app so it boots normally
afterward.

## Self-hosted Node servers: a logout can move your data into the browser

There is a specific, pre-existing quirk in **upstream's own logout**, worth knowing about if your
self-hosted install uses the Node server backend (the `save/` folder on disk, not the browser's
own storage). This happens on upstream, before you ever touch this fork — it is not something
this fork does.

Upstream's account-sync "logout" always writes the data it is un-syncing into the browser's own
plain local storage — even when the deployment's actual backend is the Node server or OPFS, not
browser storage at all. So on a Node-server deployment, logging out of RisuAccount on upstream can
leave your current data sitting in that browser's local storage, while the server's `save/` folder
stays at whatever it was before sync started. The two can disagree, and upstream does not
reconcile them for you. If you hit this, check both places on upstream before deciding which one
to make your migration backup from.

## `risuaiAccountCached`

If you ever used account sync in a given browser, it may have left a browser storage key called
`risuaiAccountCached` behind. This fork does not read, clear or otherwise touch it — it is
left exactly as account sync left it. Whether anything useful can be recovered from it is not
something this fork currently does anything about; that is left for later, if it turns out to
matter.
