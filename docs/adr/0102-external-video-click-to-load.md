# Full-length external videos load only on click

Status: accepted

Full-length pieces live on Vimeo or YouTube; short loops are MP4s on R2. A Work page shows our own poster with a play button. The provider's player iframe is inserted only when the visitor clicks, using Vimeo `dnt=1` or `youtube-nocookie.com`. Until then the page makes no third-party request, the site keeps its "collects nothing" stance without a cookie banner, and the page stays light.

## Considered Options

- **Embed the iframe directly**: rejected. It loads third-party scripts and cookies on every visit and makes the page heavier.
- **Link out to the provider**: rejected. It sends interested clients off the site at the moment they're most engaged.

## Consequences

The Work stores the provider and video id, plus a poster from our own Media, not the provider's thumbnail. The first play takes one extra click on iOS, because the embedded player starts after it loads.
