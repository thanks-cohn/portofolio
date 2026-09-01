# QUANDRANEA

## A portfolio that edits itself

Quandranea is a lightweight, Git-backed visual portfolio with an unusually small editing model:

**the website is the editor.**

There is no separate admin dashboard, no database-backed CMS, no giant page builder, and no need for the person maintaining the portfolio to understand GitHub, CSV files, deployment pipelines, or source code.

The site opens normally in **READ ONLY** mode. A tiny floating **Q** follows the visitor across every page. It can be dragged anywhere, stays softly visible when idle, returns to full visibility on hover, and keeps itself clear of the footer.

Right-click the Q, or long-press it on a phone, and the site can become an editing surface.

> **On the spot sort of design ~<3!**

The underlying ideas are not something we claim to have invented or patented. Inline editing, static sites, Git-backed content, and client collaboration all existed before this project.

The experiment is in how little machinery is required to combine them.

Quandranea asks a simpler question: **how close can the act of noticing a change be to making and publishing that change?**

The broader collaboration model behind that question is what we call **the Q&A Method**.

## The Q

The floating Q is the everyday editing interface.

Its menu includes:

- **EDIT**: turns editable text and images into direct editing targets.
- **READ ONLY**: returns the site to ordinary browsing behavior.
- **FONT → SINGLE / MULTI**: styles one text item or a selected group of text items directly on the page.
- **PUBLISH**: writes approved changes back to `truth.csv` and triggers the normal deployment pipeline.
- **GITHUB TOKEN FILE...**: opens a local file picker so the authorized editor can select a text file containing a fine-grained GitHub token.

The token is not committed to the repository, not written into `truth.csv`, and not stored with the published website. It is used only for the active editing session.

## What can be changed

The everyday editing model is intentionally narrow, but it now covers the things most likely to change during normal portfolio maintenance:

- visible text
- project titles
- body copy
- page headings
- navigation labels
- resume text
- image URLs
- portfolio section imagery
- font family
- font size
- H1 / H2 / H3 visual size presets
- solid text colors
- gradient text colors

Fonts can be chosen from a small set of ordinary presets or supplied by pasting a Google Fonts `<link>` block. SINGLE applies typography to one selected text element. MULTI lets several text elements on the same page be selected and changed together.

Typography changes can also be **REVERTED**, returning the selected text to the site's underlying style before publishing the reversal.

That is the point of the editor. It does not attempt to expose every implementation detail. It exposes the decisions a portfolio owner or collaborator is actually likely to make while looking at the finished page.

## The Q&A Method

**The Q&A Method** is the lightweight designer-client collaboration model that grew out of building Quandranea's portfolio.

It has a personal origin.

This system was created while I was trying to help my girlfriend with her portfolio. The problem was not that she needed a more powerful CMS. The problem was that the normal handoff between a person who owns a site and a person who builds it creates too much distance.

She could see exactly what she wanted changed. I could change it. But the path between those two facts still ran through screenshots, messages, explanations, code, Git, editors, and redeployments.

The Q&A Method is named after the two of us and after that original collaboration: one person looking at the finished work and another trying to make changing it as immediate and painless as possible.

The goal is not to replace the designer. It is to remove unnecessary translation between designer and client.

A traditional workflow often looks like this:

```text
client sees page
      ↓
writes a note or takes a screenshot
      ↓
explains what should change
      ↓
designer finds the matching component or CMS field
      ↓
change is made
      ↓
new preview is sent back
```

The Q&A Method tries to collapse that conversation:

```text
client sees page
      ↓
selects the actual thing
      ↓
changes or previews it in place
      ↓
designer/client review the same surface
      ↓
publish
```

The designer still decides what is editable. Publishing can still require explicit authorization. The underlying design system and source code remain protected. But the client can participate at the level that matters to them: copy, imagery, typography, color, and presentation.

That balance is central to the method:

```text
DESIGNER CONTROL
      +
CLIENT DIRECTNESS
      +
LIVE CONTEXT
      +
LIGHTWEIGHT PUBLISHING
      =
THE Q&A METHOD
```

This is not meant to replace a full CMS for every website. It is a deliberately lean option for sites where a huge administrative system would be more machinery than the project needs.

For independent web designers, small studios, portfolios, campaign sites, artist sites, restaurants, local businesses, and other relatively focused websites, the method can create a much more direct working relationship with the client.

Instead of teaching the client a page builder, handing them a complicated dashboard, or asking them to describe changes indirectly, the designer can give them a controlled editing layer attached to the thing they already understand: **their website**.

That makes the website not merely a deliverable, but a small shared workspace between the person who built it and the person who owns it.

The interesting part is not that any individual feature is unprecedented. It is that the collaboration model can remain **small, static, understandable, and cheap to maintain**.

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
right-click / long-press Q
      ↓
EDIT or FONT
      ↓
change the page in place
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

The Q&A Method treats that reduced distance as a collaboration principle, not merely a UI trick.

## Design philosophy

There should be almost no perceptible distance between seeing something that needs changing and changing it.

If the title is wrong, click the title.

If an image needs replacing, click the image and paste the new URL.

If the typography feels wrong, select the text itself and change the font, size, or color while looking at it in context.

If several elements should match, select them together.

If an experiment looks bad, revert it.

If everything looks right, publish.

No translation layer between the page and the editor is required.

The site itself is the visual reference, preview, editing surface, and collaboration surface at the same time.

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

The floating Q never needs to fully disappear. It can remain softly visible until hover, touch, or deliberate interaction brings it forward.

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

The floating Q editor simply gives the owner a much friendlier way to modify the relevant values without needing to open the CSV manually.

## Security model

Publishing still requires authorization.

A visitor can enter editing modes and experiment locally, but without a GitHub token scoped to this repository they cannot publish those changes to the official site.

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

The Q&A Method grew from a much smaller and more personal goal: **helping someone I love work on her own portfolio without making the tools become the work.**

From there, it suggests a broader way for website creators to work with clients: keep the architecture lean, keep authority controlled, but let the client collaborate directly with the finished surface rather than communicating every visual change through another layer of software.

**A website, a CMS, a preview, and a small collaboration space collapsed into the same surface.**

That is the Q&A Method.
