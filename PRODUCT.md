# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Brands and agencies** commissioning commercial work: ads, social campaigns, brand films. They come to judge whether Taha's look fits their brand and whether to make contact.
- **Creators and studios** (YouTubers, content studios, small creative teams) who need editing, motion and graphics from one person. They come to see recent work and reach Taha fast.

The site is in Turkish, so visitors are mainly Turkish-speaking. Visitors usually arrive from a link, such as Instagram, a DM or a referral, often on a phone.

## Product Purpose

taha.media is the portfolio of Taha, a video editor, motion designer and graphic designer. It publishes his Works so that clients recognise his look and get in touch. Success means a visitor sees the work within seconds, finds the Works that fit their project, and emails.

## Positioning

**A signature look.** Clients hire Taha for a recognisable visual style, not just for doing three crafts. The site must let that look carry the page, and must not wrap it in a generic portfolio template. The look itself shows in the Works and the showreel. It is not yet described in words: record it from the real material, don't invent it.

## Operating Context

- Taha (the single Editor) publishes Works through a private Payload admin.
- Media: short silent loops and the showreel loop as MP4s he exports himself. Full-length pieces are Vimeo/YouTube links shown through a click-to-load player. Works come in 16:9, 9:16 and square.
- Pages and their behaviour are settled in `docs/frontend-structure.md`. Decisions are in `docs/adr/` (backend 0001–0013, frontend 0100–0102). Terms are in `GLOSSARY.md`.

## Capabilities and Constraints

- Stack: Next.js + Tailwind v4 in a pnpm monorepo, with Payload 3 + SQLite read through the Local API (backend ADR-0001, frontend ADR-0100).
- Turkish only for now (`lang="tr"`; fonts must cover ı İ ğ ş ç ö ü). English could come later under `/en`.
- The design is drawn in Figma first, through the Figma MCP. Code follows the approved Figma.
- Quality floor (ADR-0101): WCAG 2.2 AA, content readable without JS, Safari/iOS. Motion and 3D are enhancements, off under reduced motion or Save-Data.
- Nothing is collected from visitors. Contact is `mailto:` plus social links. Analytics is cookieless Cloudflare Web Analytics, and errors go to Sentry. The only outbound hosts in the built client output are our own origins, those two and the click-to-load Vimeo and YouTube players; the build fails on any other (`infra/client-hosts-allowlist.ts`, #80).
- Open: social profile list and contact email (filled in later), and how far the 3D/scroll ambition goes (parked until the design exists).

## Brand Commitments

- Taha has his own **logo/wordmark**, which must be used. The file isn't in the repo yet.
- The owner named seven reference sites, recorded here as binding taste evidence. The visual direction is decided in new-work: juliaoleksy.com, cathydolle.com, giordanobetti.com, east64films.com, ibrahemghareib.com, artefakt.mov, danikbartolini.com.

## Evidence on Hand

- A showreel exists (or will before launch).
- 10+ finished Works that Taha has the right to show.
- Client names and logos may be shown on About.
- None of these files are in the repo yet. No testimonials, awards, press or numbers have been given, and none may be invented.

## Product Principles

1. The work is the interface: footage leads every first viewport, and the UI stays out of its way.
2. The look is the pitch: every design choice must make Taha's signature look more legible, never compete with it.
3. Two taps to contact: from any page, a visitor can reach email or socials immediately.
4. Real material only: no placeholder claims, fake clients or stock imagery in the shipped site.

## Accessibility & Inclusion

WCAG 2.2 AA. Respect `prefers-reduced-motion` and Save-Data: posters replace autoplaying video and effects. Every page must be usable on a phone over mobile data.
