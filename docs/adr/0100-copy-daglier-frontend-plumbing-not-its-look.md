# Copy daglier.com's frontend plumbing once; design the look from scratch

Status: accepted

The public frontend starts as a one-time copy of daglier.com's reusable plumbing: the `packages/ui` token and theme mechanism, `packages/motion` infrastructure, data-access and cache-tag pattern, `/internal/revalidate`, `Photo`/srcset, SEO, CI, smoke tests and deploy, and the Safari workarounds. After the copy, the two repos diverge freely. Nothing visual carries over: no curtain, melt, globe or album components, no Cooper Hewitt/Geist pairing, no green accent. taha.media gets its own design, made in Figma.

## Considered Options

- **A shared package used by both sites**: rejected. Two private repos would need publishing and version lockstep, all for sites that are meant to look different.
- **An empty Next.js app**: rejected. It would re-learn fixes daglier.com already paid for: Safari view-transition and focus bugs, the Client Hints double load, the force-dynamic nav.

## Consequences

A fix made on one site does not reach the other automatically. Port it by hand when it matters.
