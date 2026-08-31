# QUANDRANEA

## A portfolio that edits itself

Quandranea is a lightweight, Git-backed visual portfolio with an unusually small editing model:

**the website is the editor.**

There is no separate admin dashboard, no database-backed CMS, no giant page builder, and no need for the person maintaining the portfolio to understand GitHub, CSV files, deployment pipelines, or source code.

The site opens normally in **READ ONLY** mode. A tiny floating **Q** follows the visitor across every page. It can be dragged anywhere, fades after inactivity, and returns on hover.

Right-click the Q and the site can become an editing surface.

> **On the spot sort of design ~<3!**

We think of this as a one-of-a-kind, first-of-its-type experiment in ultra-lightweight inline publishing: a static portfolio that stays a normal website until its owner deliberately turns the page itself into the CMS.

## The Q

The floating Q is the entire editing interface.

Right-clicking it exposes four actions:

- **EDIT** — turns editable text and images into direct editing targets.
- **READ ONLY** — returns the site to ordinary browsing behavior.
- **PUBLISH** — writes approved changes back to `truth.csv` and triggers the normal deployment pipeline.
- **GITHUB TOKEN FILE...** — opens a local file picker so the authorized editor can select a text file containing a fine-grained GitHub token.

The token is not committed to the repository, not written into `truth.csv`, and not stored with the published website. It is used only for the active editing session.

## What can be changed

The everyday editing model is intentionally narrow.

The owner mainly changes:

- visible text
- project titles
- body copy
- page headings
- navigation labels
- resume text
- image URLs
- portfolio section imagery

That is the point.

Instead of exposing every possible technical control, the editor exposes the things a portfolio owner actually changes most often: **words and pictures**.

## How publishing works

The repository already knows its own publishing destination:

```text
Repository: thanks-cohn/portofolio
Branch: main
Source of truth: truth.csv
```

The workflow is deliberately small:

```text
READ ONLY WEBSITE
      ↓
right-click Q
      ↓
EDIT
      ↓
change text or image URL
      ↓
PUBLISH
      ↓
truth.csv
      ↓
GitHub Actions
      ↓
static site rebuild
      ↓
OFFICIAL DEPLOYED WEBSITE
```

Draft edits can remain local in the browser until the editor is ready to publish them.

## Why this is different

Most content systems separate the website from the place where the website is edited:

```text
CMS → dashboard → database → API → website
```

Quandranea collapses that distance:

```text
website ↔ Q ↔ truth.csv ↔ GitHub ↔ deploy
```

The public site remains lightweight and static. The editing layer appears only when somebody intentionally asks for it.

That makes the experience feel less like "opening the CMS" and more like simply touching the thing that needs changing.

## Design philosophy

There should be almost no perceptible distance between seeing something that needs changing and changing it.

If the title is wrong, click the title.

If an image needs replacing, click the image and paste the new URL.

If everything looks right, publish.

No translation layer between the page and the editor is required.

The site itself is the visual reference, preview, and editing surface at the same time.

## READ ONLY by default

The normal visitor experience is still just a website.

READ ONLY means:

- navigation works normally
- project images remain clickable
- hidden project pages remain reachable through their intended links
- gallery interactions continue to work
- text cannot accidentally be edited
- image clicks do not expose URL fields
- the editing UI stays out of the way

The floating Q fades after roughly ten seconds of inactivity so it does not compete with the portfolio. Hovering it brings it back immediately.

## Portfolio structure

The current site includes the original moving NUME-inspired gallery mechanics together with portfolio-specific pages and project routes.

The public navigation can stay intentionally small while deeper project pages remain available through image links.

Examples include overview pages such as PROPS and DESIGN, with deeper project pages branching beneath them.

The result is a portfolio that can feel editorial and exploratory without forcing every page into the top navigation.

## `truth.csv`

`truth.csv` remains the human-editable content source of truth.

The build pipeline converts it into generated site data, then Next.js produces the static deployment.

```text
truth.csv
   ↓
generator
   ↓
generated site data
   ↓
Next.js build
   ↓
static deployment
```

The floating Q editor simply gives the owner a much friendlier way to modify the relevant cells without needing to open the CSV manually.

## Security model

Publishing still requires authorization.

A visitor can enter EDIT mode and experiment locally, but without a GitHub token scoped to this repository they cannot publish those changes to the official site.

Recommended token scope:

```text
Repository: thanks-cohn/portofolio
Contents: Read and write
```

Keep the token in a local text file outside the repository.

Never commit API keys, GitHub tokens, Cloudflare credentials, or other secrets.

## Deployment

The public site is built through GitHub Actions and deployed as a static site.

The deployment workflow validates the content pipeline and site build before publishing the artifact.

Typical checks include:

```bash
npm ci
npm run truth:generate
npm run validate:catalog
npm run validate:targets
npm run build:pages
```

The Python portfolio editor is also syntax-checked in CI.

## Desktop editor

The repository still includes the richer desktop editing tools for deeper maintenance and recovery.

The normal launcher is:

```bat
py tools\truth_csv_editor.py truth.csv
```

That editor can handle more advanced portfolio maintenance, while the floating Q is meant to be the tiny everyday interface.

## Lineage

Quandranea grew out of the NUME visual-gallery system, retaining its moving rows, enlarged project presentation, and interaction language while turning the project into a portfolio and publishing experiment of its own.

The unusual part is no longer only the gallery.

It is the idea that a deployed static website can carry its own tiny editing surface with it, remain read-only for ordinary visitors, and become writable only when the owner deliberately unlocks publishing.

**A website, a CMS, and a preview collapsed into the same surface.**

That is the experiment.
