---
name: Plan de com KEDGE
description: The communication team's planning tool, played as the category standard (Asana, Monday, Trello) in KEDGE colours.
colors:
  yellow: "#FFD452"
  anthracite: "#333539"
  anthracite-deep: "#26282B"
  bg: "#F4F4F1"
  card: "#FFFFFF"
  text: "#2B2D31"
  text2: "#6A6C71"
  sep: "#DADAD5"
  fill: "#E6E6E2"
  hover: "#ECECE8"
  sel: "#FFF3C7"
  ok-bg: "#DCEFE3"
  ok-ink: "#1C5A37"
  st-conf: "#EFEFEB"
  red: "#C62828"
typography:
  page-title:
    fontFamily: "KRC Serif, Georgia, Times New Roman, serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.15
  group-title:
    fontFamily: "KRC Serif, Georgia, Times New Roman, serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
  row-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  r1: "6px"
  r2: "8px"
  r3: "12px"
  r4: "16px"
  pill: "11px"
spacing:
  row-y: "8px"
  row-x: "16px"
  group-gap: "20px"
  side: "216px"
  fiche: "460px"
components:
  button-primary:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.anthracite-deep}"
    rounded: "{rounded.r2}"
    height: "36px"
    padding: "0 14px"
  state-confirmer:
    backgroundColor: "{colors.st-conf}"
    textColor: "{colors.text}"
    rounded: "{rounded.r1}"
    height: "28px"
  state-prevu:
    backgroundColor: "{colors.anthracite}"
    textColor: "{colors.card}"
    rounded: "{rounded.r1}"
    height: "28px"
  state-diffuse:
    backgroundColor: "{colors.ok-bg}"
    textColor: "{colors.ok-ink}"
    rounded: "{rounded.r1}"
    height: "28px"
  tag:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    height: "22px"
  tag-temps-fort:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.anthracite-deep}"
    rounded: "{rounded.pill}"
    height: "22px"
  group-card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.r3}"
  group-header-now:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.anthracite-deep}"
  row-selected:
    backgroundColor: "{colors.sel}"
  chip-filter:
    textColor: "{colors.text2}"
    rounded: "{rounded.r2}"
    height: "32px"
---

# Design System: Plan de com KEDGE

## Overview

**Creative North Star: "The team board, in KEDGE colours"**

The plan reads like the work boards the team already knows from Asana, Monday and Trello: every week is a white table with its own header, every row answers date, action, service, message and state, and the state is a filled cell you can read from across the room. Nothing about the layout is invented; the identity comes from KEDGE yellow, anthracite and KRC Serif, used with discipline.

Colour carries meaning, not decoration. Yellow marks what matters now (this week, temps forts, the main button, the selected row). Anthracite marks what is planned. Green marks what is done. Everything else stays warm grey and white.

**Key Characteristics:**
- Weeks as white group tables with a serif title, a date range and a count badge.
- State as a filled cell: dashed « À confirmer », anthracite « Prévu », green « Diffusé » with a tick.
- One yellow group: « Cette semaine ».
- Desktop first, with a dark anthracite side menu; the phone folds the same tables into two-line rows.
- Little text: labels are short, tags replace sentences, no legend needed.

## Colors

### Primary
- **KEDGE yellow** `#FFD452`: main action button, « Cette semaine » header, temps fort tag and dot, count badge of the current week, active item icon in the side menu. Never a large tinted surface behind content blocks.

### Secondary
- **Anthracite** `#333539` / deep `#26282B`: side menu, « Prévu » state cell, text on yellow, focus ring in light mode.

### Tertiary
- **Diffusé green** `#DCEFE3` on `#1C5A37`: the done state only (rows, calendar items, fiche state segment).

### Neutral
- Page `#F4F4F1`, cards `#FFFFFF`, text `#2B2D31`, secondary text `#6A6C71`, separators `#DADAD5`, fills `#E6E6E2`, hover `#ECECE8`, selected row `#FFF3C7`. Dark mode swaps to `#0F1012` page, `#1E1F22` cards, yellow focus ring.

### Named Rules
**The Meaning Rule.** Yellow means now or important, anthracite means planned, green means done. No colour is used for decoration alone.

**The Selected Is Not Hover Rule.** Hover is neutral grey; the open row is pale yellow with a heavier title. Never a side stripe.

## Typography

KRC Serif for titles (page, group, fiche, home sections); the system sans for everything else.

### Hierarchy
- Page title: KRC Serif 700, about 30px.
- Group (week) title and home section titles: KRC Serif 700, 18 to 19px.
- Row title: sans 15.5px regular; temps fort titles switch to KRC Serif.
- Body and fiche values: sans 15px.
- Column headers and labels: sans 12 to 13.5px, 600, sentence case.

### Named Rules
**The Sentence Case Rule.** Labels, section titles and column headers are written in sentence case, never uppercase with letter spacing.

## Layout

- Desktop: 216px anthracite side menu, content column, fiche panel of 460px beside the plan (overlaying below 1200px).
- Group table columns: `96px | 1fr | 132px | 190px | 124px` (date, action, service, message, state). With the fiche open the message column drops; between 768 and 1100px it drops too, and the « pour <temps fort> » hint hides.
- Toolbar: period tabs on the left, then one group (Service, Message, Type, list or calendar switch, print) that wraps as a block.
- Phone (below 768px): bottom navigation with a yellow round add button; rows become date | title with the service underneath | state; column headers hide; the toolbar scrolls away with the page.

## Elevation & Depth

Flat with a soft lift. Group tables, home lists and counters use `--lift` (`0 1px 2px rgba(20,20,20,.06), 0 3px 10px rgba(20,20,20,.05)`). Menus, dialogs and the fiche use the stronger `--shadow`.

## Shapes

Radii 6px (state cells, menu items), 8px (buttons, chips, segmented controls), 12px (group tables), 16px (dialogs). Tags are fully rounded (11px on 22px height).

## Components

### Buttons
Primary is yellow with anthracite text, 36px high, 8px radius. Quiet buttons are transparent with a grey hover. Icon buttons are 36px squares with a tooltip.

### State cell
A 28px filled cell, minimum 112px wide in tables. Clicking it opens a menu that shows the three cells themselves. In the fiche, the state is a segmented control whose chosen segment takes the same colour.

### Chips and tags
Filter chips: 32px, 1px border, grey text; a picked filter fills. Message tags: 22px grey pills. Temps fort tag: yellow pill.

### Cards / Containers
A week is a white 12px card holding a header (serif title, small range, count badge on the right), a column header row and 50px rows separated by hairlines.

### Navigation
Desktop side menu in anthracite with the active item in a lighter fill and a yellow icon; phone bottom bar with the add button raised in yellow.

### Fiche
A right-hand panel: type as a tag, serif title, a two-column list of values, one yellow « Demander des éléments » button, then sections with sentence-case headings.

## Do's and Don'ts

### Do:
- Do keep the order date, title, service, message, state on every row.
- Do show state as a filled cell, never as plain text.
- Do keep « Cette semaine » the only yellow group header.
- Do write labels in sentence case and keep them short.
- Do let the phone fold the same table rather than inventing a new layout.

### Don't:
- Don't use coloured side stripes or borders on cards or rows.
- Don't tint whole temps fort blocks yellow, add a top bar, a period frieze or service avatars (rejected 2026-11-17).
- Don't use running-track or sport metaphors.
- Don't show lists of what a service is missing to every service.
- Don't use uppercase letter-spaced eyebrows above titles.
- Don't call the calendar view « Grille ».
