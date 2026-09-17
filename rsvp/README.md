# RSVP setup

The website asks the guest for their name, looks that name up in a private
Google Sheet, shows how many seats are held for their party, and writes each
reply back to the same Sheet.

**The guest list is never in the website.** This repository is public, so a
list embedded in the page would tell anyone on the internet who was invited
and how many seats each family was given. Keeping it in the Sheet means the
page can only ask about one name at a time, and only the couple can see the
list itself.

Setup takes about ten minutes and is done once.

---

## 1. Build the guest list

Create a new Google Sheet. Name the first tab **`Guests`** exactly, and give
it two columns:

| Party | Name |
|---|---|
| Santos Family | Juan Santos |
| Santos Family | Maria Santos |
| Santos Family | Angelica Santos |
| Santos Family | Jerwin Santos |
| Cruz Family | Pedro Cruz |
| Cruz Family | Ana Cruz |
| Reyes | Liza Reyes |

Two rules, and only two:

- **One row per person.** Four rows for a family of four.
- **Everyone in the same party shares the same Party value**, spelled the
  same way every time. That value is what ties them together — it is how the
  site knows that typing "Juan Santos" should bring up all four Santoses.

The number of seats is simply how many rows that party has. There is no seat
column to keep in sync, and no way for the two to disagree.

The Party name is shown to nobody. Use whatever is easiest to keep straight.

**Names can be typed forgivingly.** Case, accents, extra spaces, periods and
hyphens are all ignored, so `ma. rhea gabas` finds `Ma. Rhea Gabas`. A guest
who types only part of their name still gets through when it matches exactly
one person — if it could match two, the site says it cannot find them rather
than showing someone else's family.

> **Keep this Sheet private.** Do not set it to "anyone with the link".
> The whole point of holding the list here is that only you can see it.
> Step 3 makes the *script* public, which is a different thing — the script
> answers one question about one name and never hands out the list.

## 2. Add the script

In the Sheet: **Extensions → Apps Script**.

Delete whatever is in the editor, paste the whole of
[`Code.gs`](Code.gs), and save.

### Who gets told

Add a second tab named **`Settings`** with two cells:

| A | B |
|---|---|
| notify | you@example.com |

That address gets a short email as each reply arrives — who accepted, who
declined, how many seats free up. Several addresses: separate with commas.
Leave the cell empty for none.

Put your own address there while testing and swap it for the couple's when
you hand it over. **Changing this cell needs no redeployment** — which is
why it lives in the sheet and not in the script. The `Responses` tab fills
in either case; the email just means nobody has to remember to look.

## 3. Publish it

**Deploy → New deployment → Web app**

| Setting | Value |
|---|---|
| Description | RSVP |
| Execute as | **Me** |
| Who has access | **Anyone** |

Google will ask you to review permissions the first time. It will warn that
the app is not verified — that is expected for your own script. Choose
**Advanced → Go to (project name)** and allow it.

Copy the **Web app URL**. It ends in `/exec`.

> "Anyone" lets the website reach the script without a login. It does not
> make the Sheet public — nobody can open the Sheet, and the script only
> ever answers a question about one name. It never returns the list.

## 4. Switch it on

In `assets/js/main.js`, find this line near the RSVP section:

```js
var RSVP_ENDPOINT = '';
```

Put the URL between the quotes:

```js
var RSVP_ENDPOINT = 'https://script.google.com/macros/s/AKfycb.../exec';
```

Commit. The form appears on the site within a minute.

While that line is empty the form stays hidden and the RSVP section shows
"please reply to the invitation you received" instead — so the site is never
broken while the list is being prepared.

## 5. Check it

Open the site, type a name from the list, and confirm a reply. A
**`Responses`** tab appears in the Sheet with a row per guest:

| Replied at | Party | Guest | Reply | Looked up as |
|---|---|---|---|---|

Replies are appended, never overwritten. If a family replies twice, both are
kept and the later one is the answer — you can see that someone changed
their mind, and when.

---

## Changing the list later

Edit the Sheet. Nothing needs redeploying and the website needs no change —
it reads the list live.

## If something goes wrong

**"We could not find that name"** — the name is not in `Guests`, or it is
spelled differently there. Check for a trailing space in the cell.

**"Something went wrong reaching our guest list"** — the deployment is not
public, or the URL is wrong. Re-check step 3, and make sure the URL ends in
`/exec` and not `/dev`.

**Replies are not arriving** — open the Apps Script editor and look at
**Executions** in the left sidebar. Failures are listed there with the
reason.

**After editing `Code.gs`** you must deploy again: **Deploy → Manage
deployments → edit → Version: New version → Deploy**. Saving alone does not
update the live URL, which is the single most common reason a change seems
to do nothing.


---

## Guest photos and videos

The same web app URL now also takes uploads. Nothing new to deploy differently:
it is the same script, the same deployment.

### What to do in the Sheet

Nothing is required. The first time a guest uploads, the script makes a folder
in the script owner's Drive called **John + Maria · Guest photos and videos**,
and an **Uploads** tab appears logging who sent what.

To send them somewhere you have already made instead, open that folder in Drive,
copy the URL, and put it in the `Settings` tab:

| A | B |
|---|---|
| notify | mregabas@gmail.com |
| uploads | https://drive.google.com/drive/folders/1AbCdEf... |

A cell, not a redeploy.

### After adding this code

The script now touches Drive and makes requests outside Google, which the first
version did not.

Apps Script decides which permissions to ask for by reading **the function you
are about to run**, not the manifest and not the rest of the file. So running
something that only touches Drive gets a consent screen about Drive, the script
is still left without permission to reach outside Google, and every upload then
falls to the slow route with this in the `Uploads` sheet:

> Wala kang pahintulot na tumawag kay UrlFetchApp.fetch
> Required permissions: .../auth/script.external_request

First check `appsscript.json` in the editor (Project Settings ▸ Show
'appsscript.json' manifest file). It must carry the `oauthScopes` list. Apps
Script validates this file on save and will not keep a key it does not
recognise, so paste it exactly as it appears in this folder, with nothing
extra: a single stray field and the whole paste is refused, silently, leaving
the manifest as it was.

**Run `authorise` once** (Run ▸ authorise). It touches everything the web app
touches, so one consent screen covers the lot, and it opens a real upload
session to prove the fast route works. Read the Execution log afterwards:

```
Drive       OK, uploads land in "..."
Guest list  OK, 41 names
Fast route  OK, Google opened an upload session
```

Then deploy a **new version** of the web app. The URL does not change.

Adding a scope later means authorising again. A new deployment on its own does
not ask, and the old permissions stay exactly as they were.

### Why the bytes do not pass through the script

A guest's video can be 200 MB. Apps Script would have to carry that base64
encoded inside one request, and the large ones simply would not fit.

So `uploadInit` only opens a resumable upload session on Drive using the
script's own credentials and hands the session URL back to the phone. The phone
streams the file to Google directly, 8 MB at a time, and a chunk that fails on
forest signal is retried on its own instead of restarting the file. That URL
accepts the bytes of one named file and grants nothing else.

`uploadBlob` is the fallback for when the direct route is unavailable. It is
capped at 18 MB, because there it really is the script carrying the payload.

### Where a long video goes

While the fast route is working there is no size limit at all. When it is not,
the page can only carry about 18 MB, and a full length video is well past that.

Make a **second** folder for those, share it as **Anyone with the link · Editor**,
and put its URL in the `Settings` tab under `bigfiles`:

| A | B |
|---|---|
| notify | mregabas@gmail.com |
| uploads | https://drive.google.com/drive/folders/... |
| bigfiles | https://drive.google.com/drive/folders/... |

The page then offers that folder as a link, but only to a guest who actually
has a file too large to send. Leave `bigfiles` empty and it says to contact the
couple instead.

**Keep the two folders separate.** A link that lets a stranger add files also
lets them delete the ones already there, and the collection everyone's photos
land in should not be sitting behind a link that travels around a wedding.

### How large a file a guest may send

Set it in the `Settings` tab under `maxfile`. A number, with or without a
unit: `100`, `100 MB`, `1.5 GB`. Leave it empty and 100 MB applies.

Roughly, from a phone: 1080p video is about 60 MB a minute, 4K about three
times that.

| `maxfile` | About |
|---|---|
| 100 MB | a minute or two of video, every photo |
| 250 MB | four or five minutes |
| 500 MB | eight or ten minutes |

A file over the limit is refused the moment it is picked, and the page names
the figure rather than just saying no. Change the cell and the next guest gets
the new rule; there is nothing to redeploy.

`authorise` prints what is currently in force:

```
Max file    100 MB per file
Room left   11.4 GB in this Drive
```

### Storage

Uploads land in the script owner's Drive and count against that account's quota
(15 GB on a free Google account, shared with Gmail and Photos).

Running out of room stops an upload as surely as the size limit does, so the
page checks that too and says which one applied.

A wedding's worth of guest video will still exceed 15 GB. Watch it on the day,
and either clear space or move the collection to an account with room.
