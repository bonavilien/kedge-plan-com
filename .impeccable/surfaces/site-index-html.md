---
version: 1
slug: "site-index-html"
primary_target: "site/index.html"
related_targets: []
---

# Le plan (and the app shell)

Scope: the whole V2 app (Accueil, Le plan liste et calendrier, fiche, Réunion, Réglages). Mode: operate.
Audience and job: pilotes and service heads plan and follow com actions per period, at a desk; phone for quick checks.
Constraints: KEDGE yellow #FFD452, anthracite #333539/#26282B, KRC Serif titles (binding). No coloured side stripes, no missing-lists for all, no sport metaphor, no service avatars, no top-bar/period-frieze redesign (rejected 17 Nov).

## Direction contract

THESIS: The plan as a work-management board in the Asana / Monday / Trello class: each week is a group table with its own column header and count, and the state is a full coloured cell you click to change. It refuses the grey, low-contrast list where every row looks the same.

OWN-WORLD: Soft grey page (#F4F4F1), white group tables with 12px radius and a soft offset shadow, anthracite rail kept. KRC Serif for page and group titles, system sans for data. State cells filled: À confirmer = pale grey with dashed edge, Prévu = anthracite with white text, Diffusé = green (#2F8A57 family) with a check. Temps fort rows carry a yellow « Temps fort » tag and a serif title. Messages as neutral rounded tags.

STORY: In one look the visitor sees each week, what is planned, who carries it, which message, and which state, and changes a state in one click.

FIRST VIEWPORT: Page title « Le plan » + period name; toolbar with period tabs, Service/Message/Type filters, Liste/Calendrier switch. Then the « Cette semaine » group expanded: serif group title, count badge, column header (Date, Action, Service, Message, État), rows 48px. Primary action stays the yellow « Nouveau » in the rail.

FORM: canon (the category standard played straight), chosen by Julien over the roll; bar = Asana, Monday, Trello. seed:499bfc55e309af4c

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
