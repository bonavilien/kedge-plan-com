# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- Pilotes: Julien (chef de projet com) and Estelle. They edit everything, run the weekly meeting, and are notified of every new action or temps fort.
- Service heads of the communication and programme services (Relations presse, Réseaux sociaux, Production vidéo, Content, and the programme side). They edit their own service's actions and what they created, answer requests for elements, and check their week.
- Lecteurs (visitors): read only.
- Main use is on the computer, at a desk, between meetings. The phone is secondary: quick checks and push notifications.

## Product Purpose
Plan and follow KEDGE Business School's communication production and diffusion around 5 key messages (Filières, Alumni, International, Continuum, Réputation, plus the Recrutement label outside the five) and the yearly temps forts, period by period (Installer, Considérer, Préférer, Convertir, Décider). Success: everyone sees what is planned, who does it and its state, requests for elements reach the right person, and the weekly meeting agenda builds itself.

## Positioning
Built for this team's own calendar: the 5 recruitment periods are the navigation, temps forts anchor the actions that relay them, and the meeting view comes from the data. It replaces a PowerPoint "calendrier de diffusion".

## Operating Context
- Weekly com meeting run from the Réunion screen (ordre du jour, bilan).
- Documents live in SharePoint; the app stores links only.
- Notifications: phone push. A temps fort notifies all services; an action notifies only its own service; « Prévenir » alerts another service by hand.

## Capabilities and Constraints
- Vanilla JS, no build, GitHub Pages (main = live), Supabase base. Database changes are SQL that Julien pastes in the Supabase SQL Editor himself.
- Items: action, temps fort (possibly multi-day), sujet de la période, classement, partenariat média payant. Three states: à confirmer, prévu, diffusé. Dates may be month-only (« courant novembre »).
- Messages in the fiche written as one sentence (« @Estelle les visuels pour vendredi ») : dated requests with a reminder the day before, « pour info » messages without a date, private « Rappel pour moi », pin, duplicate, postpone or cancel with a reason, places.
- Résultats screen (views, press coverage, sign-ups, clicks per period) ; Budget tab for the chefs de projet only (partnership amounts and period envelopes).
- Three screens: Accueil, Le plan (list or calendar grid), Réunion; the fiche opens beside the plan.

## Brand Commitments
- KEDGE identity is binding (confirmed by Julien 2026-11-17): KEDGE logo, yellow #FFD452, anthracite #333539 / #26282B, KRC Serif for titles. Same colours and font in any redesign.
- Little text, airy, simple ("plus c'est simple, plus c'est clair"). Each information level styled differently; action priority order: date, titre, service, message, état.
- Visual codes over words, but no code that needs a legend (no message numbers).
- Banned: cards with a coloured side stripe or border, running-track or sport metaphor, lists of what is missing visible to every service. « Grille » is called « Calendrier ».
- Standing preference (Julien, 2026-11-17): the category standard, played straight, at the finish level of Asana, Monday and Trello (more colour and visual states, airier rows), inside the KEDGE palette.
- Rejected 2026-11-17: a mockup with a top bar, a period frieze, yellow-tinted temps fort blocks and service avatars.

## Evidence on Hand
- Real periods, messages and services from the base; demo data in `?demo` mode (synthetic).
- Logo files in `site/assets/`, KRC Serif in `site/fonts/`.

## Product Principles
1. The period and its temps forts are the frame; everything else hangs on them.
2. One glance answers: what, when, who, which state.
3. Every request names its action, date and service, with one button.
4. Nothing shames a service in front of the others.
5. Computer first, phone still works.

## Accessibility & Inclusion
WCAG 2.2 AA: contrast, visible keyboard focus, keyboard navigation (N, Ctrl K, arrows, Échap), dark mode readable.
