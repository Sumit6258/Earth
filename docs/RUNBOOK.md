# Run it: the GitHub-only workflow

**What "the cloud" is for.** GitHub Pages can *host* EARTH, but hosting is the easy part. Something with internet access has to install packages, download NASA data, build textures and drive a real browser against the result. **GitHub Actions is that machine**: it runs on every push, has internet, and is free for public repositories. What it lacks is a person at the keyboard, so the loop is: *push → the `ci` run produces an evidence summary → you paste it back to Claude → next change*.

## 0. Use a new repo, not your personal-site repo
GitHub Pages serves one site per repository. Your personal-site repo keeps serving `sumitsuman.com`; EARTH gets its own repo (suggested name `earth`) with its own custom domain `earth.sumitsuman.com`. Putting it inside the personal-site repo would give you `sumitsuman.com/earth/`, not the subdomain. (⚠ On a free GitHub account, Pages needs a public repo. If your personal site is hosted somewhere other than GitHub Pages, the same idea holds: a separate project and a CNAME for the subdomain.)

## 1. Create the repo and push these files
Easiest, since the folder is already open in VS Code: **Source Control → Initialize Repository → write a commit message → Commit → Publish to GitHub** (public). This includes the hidden `.github/` folder, which matters because the workflows live there. If you upload through github.com instead, the uploader can skip hidden folders: create `.github/workflows/ci.yml` and `.github/workflows/deploy.yml` with **Add file → Create new file** and paste the contents.

## 2. Turn on Pages and set the domain (before DNS)
**Settings → Pages → Build and deployment → Source: GitHub Actions.** Then **Custom domain: `earth.sumitsuman.com` → Save.** With an Actions deploy no `CNAME` file is needed; GitHub's docs say add the domain in repo settings first, then configure DNS. Recommended: verify `sumitsuman.com` in your *account* Pages settings first, which prevents domain takeover.

## 3. DNS
At your DNS provider add a record: **CNAME `earth` → `<your-github-username>.github.io`** (no repository name in the value). When it propagates, tick **Enforce HTTPS** in Settings → Pages.

## 4. Watch the first run
**Actions** tab: `ci` and `deploy` start on the first push. `deploy` publishes the holding page; `ci` is the gate (preflight, NASA GIBS catalog, type-check, M0 tests). The first run may well go red somewhere: this scaffold was written offline and has never met a package registry. That is what the run is for.

## 5. Send it back
Open the `ci` run and scroll to **Summary**. Copy the "EARTH M0 evidence" block into the chat. If a step is red, paste that step's log. Download the `m0-evidence` artifact; inside is `package-lock.json`: commit it to the repo root (after that CI uses `npm ci`).

## 6. What happens next
Each milestone comes back as a zip of new and changed files: unzip over the repo, commit, push. CI tests it and Pages deploys it. For the real-GPU look and speed, open the live URL on your Mac or phone; viewing is not local development.

## Limits to know
CI renders WebGL in software: it proves things draw and work, not frame rate. The `AC-xx` acceptance tests stay red until their milestone is built, and `ci` runs only M0.
