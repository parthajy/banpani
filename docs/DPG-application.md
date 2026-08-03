# Banpani — Digital Public Goods application (paste-ready answers)

**Project:** Banpani — Coordinating Community Flood Relief
**Live:** https://banpani.org · **Code:** https://github.com/parthajy/banpani
**Maintainer:** Partha Borthakur (individual), India
**Licenses:** Code — MIT · Community-submitted data — CC0 1.0

This document maps Banpani to the [DPG Standard](https://digitalpublicgoods.net/standard/) 9 indicators, plus the submission form's ownership section. Text below can be pasted directly into the application.

---

## Ownership section (submission form)

**Who owns this digital solution?**
> Partha Borthakur (individual, sole author and maintainer). There is no company or organisation; Banpani is an individually-authored open-source project run for the community.

**Evidence of ownership:**
> - https://github.com/parthajy/banpani/blob/main/LICENSE — MIT copyright line reads "Copyright (c) 2026 Partha Borthakur"
> - https://github.com/parthajy/banpani — repository under my account, sole committer
> - https://banpani.org/about.html — states "created and is maintained by Partha Borthakur; code © 2026 Partha Borthakur, MIT License"

**Type of organisation:** Individual

**Where is the owner based?** India

**Do you own all of the code, content and/or data?**
> Yes for the code — I am the sole author and copyright holder, released under the MIT License. Third-party components are limited to openly-licensed sources: basemap/tiles from OpenStreetMap (ODbL); weather from Open-Meteo (open, attribution-based); official flood bulletins and relief-camp figures from ASDMA (public government data). User-submitted reports and photos are contributed by the community as open data (CC0) with no personal identifiers exposed.

**Do you have the right to re-distribute?**
> Code: the MIT License permits unrestricted redistribution. There is no CLA; external contributions are accepted under GitHub's Terms of Service inbound=outbound provision, i.e. contributions are licensed under the repository's MIT license.
> Data: OpenStreetMap data is redistributed under ODbL with attribution; Open-Meteo data is openly licensed for reuse; ASDMA bulletins are public government information. Community-submitted content is dedicated to the public domain under CC0 1.0.

---

## Indicator 1 — Relevance to the SDGs

> Banpani directly supports **SDG 11 (Sustainable Cities and Communities), target 11.5** — "significantly reduce the number of deaths and the number of people affected … by disasters, including water-related disasters" — by coordinating community flood relief so no area is left stranded and effort is not duplicated. It also supports **SDG 13 (Climate Action), target 13.1** — "strengthen resilience and adaptive capacity to climate-related hazards and natural disasters" — and contributes to **SDG 1.5** (resilience of the poor to climate/disaster shocks) and **SDG 3** (emergency health response). Evidence of purpose: https://banpani.org/about.html and the project README.

## Indicator 2 — Use of an approved open license

> - **Code:** MIT License (OSI-approved) — https://github.com/parthajy/banpani/blob/main/LICENSE
> - **Data:** community-submitted content is dedicated to the public domain under CC0 1.0 — stated on the report forms, the About page, the Privacy page, and the README.

## Indicator 3 — Clear ownership

> Ownership is clearly defined: Partha Borthakur holds the copyright (see MIT LICENSE), is the sole committer on the public repository, and is named as creator/maintainer on the About and Privacy pages. See the Ownership section above for evidence links.

## Indicator 4 — Platform independence

> Banpani has **no mandatory closed-source dependencies and no vendor lock-in.** The server uses only the Node.js standard library (`node:http` + `node:sqlite`) with **zero npm dependencies**. The client uses Leaflet (BSD-2-Clause) with OpenStreetMap tiles (open data; the repo also documents self-hosting Protomaps tiles for zero recurring cost). Weather is from the open Open-Meteo API. The only non-open data source (Google News RSS for a headlines panel) is **optional and degrades gracefully** — the platform is fully functional without it. Data is stored in SQLite (an open, ubiquitous file format). The whole system self-hosts on any commodity Linux VPS (~US$6/month). Open, swappable alternatives exist for every external component. The live deployment currently uses Google Analytics for aggregate visitor counts alongside a cookieless first-party server tally; analytics is a non-mandatory, one-toggle add-on (the code runs identically without it) and can be removed for a stricter deployment.

## Indicator 5 — Documentation

> - **README** — project overview, architecture, trust model, and the "License & spirit" section: https://github.com/parthajy/banpani/blob/main/README.md
> - **deploy/README.md** — step-by-step deployment (droplet + nginx + TLS + backups + auto-deploy)
> - **Inline code comments** throughout `server/` and `frontend/` explaining the trust model, privacy handling, and data flow
> - **User-facing docs** — the About page (how to use, how trust works, data sources) and the Privacy page

## Indicator 6 — Mechanism for extracting data (non-proprietary format)

> All non-personal data is openly readable, in non-proprietary machine-readable formats, with no account required:
> - **JSON API:** `GET /api/state` (full map state), `GET /api/activity` (transparency feed), `GET /api/report` (situation report)
> - **Human + machine report:** a public 6-hourly situation report at `/report.html`
> - **Formats:** JSON and GeoJSON over standard HTTP; underlying store is SQLite (open format)
> Personal identifiers (phone numbers, IP addresses) are stripped from every response by design. The exported data is CC0.

## Indicator 7 — Adherence to privacy and applicable laws

> Full policy: https://banpani.org/privacy.html. Banpani is operated from India and handles personal data in line with the **Digital Personal Data Protection Act, 2023** and the **Information Technology Act, 2000**; its privacy-by-design approach (data minimisation, purpose limitation) also aligns with the **GDPR**, so redeployments elsewhere start from a compliant baseline. Concretely: **no accounts or logins**; the only optional personal datum is a phone number, which is **never shown publicly and never included in any bulk/API response** (revealed one-at-a-time via a logged endpoint only when a volunteer must coordinate); **IP addresses are hashed** (sha256 with a per-deploy salt), never stored raw; **photo GPS/EXIF metadata is stripped in the browser** before upload; phone numbers are **deleted within 3 months**; users can request removal of any content via the contact form.

## Indicator 8 — Adherence to standards & best practices

> Banpani follows the **Principles for Digital Development**: open-source and built for reuse (MIT, self-hostable, "run it for the next flood anywhere"); **privacy & security by design** (see Indicator 9); and **designed for inclusion and scale** — trilingual (English / Assamese / Hindi), mobile-first (a native-style drag bottom sheet, ≥44px targets), and resilient on weak flood-zone networks (gzip, a network-first offline PWA with service worker + Web App Manifest). It uses **open standards** throughout: OpenStreetMap and GeoJSON for geodata, a semantic JSON/HTTP REST API, and responsive, accessible HTML. Moderation follows a transparent **community-consensus** model rather than a single gatekeeper.

## Indicator 9 — Do no harm by design

> **Privacy of vulnerable people (disaster victims):** no accounts; names are never requested on reports; phone numbers are private and revealed only one-at-a-time through a logged endpoint; IP addresses are hashed, never raw; photo GPS/EXIF is stripped client-side; the open dataset contains no personal identifiers.
> **Protection from fraud:** Banpani **never asks for, stores, or displays any way to collect money** — no bank account, UPI ID, or card fields exist anywhere. This deliberately removes the single most common disaster-relief fraud vector and means there is no financial data to protect.
> **Inappropriate/illegal content & harassment:** every submission can be **flagged by the community and auto-hidden** (2 flags), reports are **verified by consensus** (3 independent confirmations) and false ones flagged and hidden, and a maintainer can take down anything via the contact channel. There is **no direct messaging to victims** and no public exposure of any individual. Voting is limited to one per device to resist manipulation.
> **Analytics:** the live deployment uses Google Analytics for aggregate visitor counts only (never linked to any report or phone number, disclosed on the Privacy page, blockable by the user); there is no advertising and no cross-site tracking. A stricter deployment can disable it in one step and rely on the built-in cookieless first-party counter.

---

_Last updated: August 2026. This file lives in the repository so the self-assessment is versioned and public, like everything else in the project._
