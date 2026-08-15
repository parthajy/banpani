# Contributing to Banpani

Banpani is a free, community-run disaster-coordination map. It is built and run by volunteers and
owned by no one. Thank you for wanting to help. This page explains how to contribute safely, how work
is reviewed, and how contributors are recognised.

Everything here is designed around one idea: **you can contribute freely without anyone having to
trust you first, because nothing goes live until it is reviewed and deployed by a maintainer.**

> **Current focus:** the core tech is deliberately small and handled in-house, so we are **not actively
> onboarding code contributors** right now. Pull requests are always welcome (this guide tells you how),
> but the project's biggest need is **distribution and outreach**, not more code. If you want to help the
> most, see [banpani.org/contributors](https://banpani.org/contributors).

## The non-negotiables (please read first)

Any change, from anyone, is rejected if it breaks one of these. They are the soul of the project:

- **No user accounts.** No logins, no passwords, ever.
- **Phone numbers of people in distress are never shown publicly.** One-at-a-time reveal to a
  verifying volunteer, logged. Never bulk, never public.
- **No money, ever.** No payments, donations collected, ads, or paywalls anywhere.
- **IP addresses are hashed, never stored raw.**
- **Zero runtime npm dependencies.** The app runs on Node's built-ins + vanilla JS + Leaflet. If you
  believe a dependency is truly necessary, open an issue and make the case first, do not add it in a PR.
- **Owned by no one, open forever** (MIT code, CC0 community data).
- **Honest labelling.** Community reports are community reports, not official data. Modelled signals
  (e.g. GloFAS river risk) are labelled as modelled, never as official.

See the full public promise at [banpani.org/manifesto](https://banpani.org/manifesto).

## How to contribute (the workflow)

1. **Open an issue first for anything non-trivial.** Bugfix? A short issue is fine. New feature or an
   architecture change? Open an issue / RFC and let's align *before* you write code. This keeps work
   transparent and saves you effort.
2. **Fork the repo, make your change on a branch.**
3. **Open a Pull Request.** Describe what and why. Keep PRs small and focused.
4. **CI runs automatically** (syntax + load-time smoke test). A PR that breaks the app fails and can't
   be merged.
5. **A maintainer reviews and merges.** `main` is protected: no direct pushes, review required.
6. **Deploy is a separate, maintainer-only step.** A merged PR is not live until a maintainer deploys.

Match the surrounding code style. No build step, no formatter, no framework, keep it that way.

Run the checks locally before opening a PR:

```
node --check frontend/app.js && node test/smoke.mjs
```

## Ways to help (not just code)

- **Code**: fixes, features, performance, accessibility.
- **Translation**: we support Assamese, Bengali, Hindi, Odia, English and Spanish. More languages and
  **native-speaker review** of the existing ones are very welcome (strings live in
  `frontend/i18n.js`).
- **Marketing & outreach**: getting Banpani to the people who need it (see `BRAND.md` for guardrails).
- **Community verification**: verifying reports on the live map when a disaster is active.
- **Design, docs, testing**: all welcome.

## Roles (how trust grows)

You earn access by a demonstrated track record, decided by maintainers, not by a vote or headcount.

| Role | What you can do | How you get there |
| --- | --- | --- |
| **Contributor** | fork, open issues and PRs | just show up |
| **Reviewer** | review others' PRs, triage issues | several solid contributions |
| **Maintainer** | merge PRs to `main` | sustained reliability + maintainer trust |
| **Operator** | deploy + server access | reserved; grows very slowly |

Merge and deploy rights are never granted by voting. This is deliberate: it means sock-puppet or
alias accounts can only add PRs to a review queue, never gain control.

## Recognition

Contributors are credited publicly at [banpani.org/contributors](https://banpani.org/contributors),
code and non-code alike. Every merged PR also credits you permanently in the Git history. You choose
how you're named there: your handle, your first name, or simply "a volunteer".

## Code of conduct

Be kind, be honest, assume good faith. We are here to help people in the worst moments of their lives.
Anything that endangers or exploits vulnerable people (for example, mapping named individuals, or
collecting money in Banpani's name) is out of bounds.
