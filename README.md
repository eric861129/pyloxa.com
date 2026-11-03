# Pyloxa website

Static site for Pyloxa: `index.html` (English) and `zh-TW/index.html` (繁體中文). No build step; serve the folder as is.

- Download links point to the latest release in [Pyloxa-Releases](https://github.com/eric861129/Pyloxa-Releases/releases/latest).
- `legal/` holds copies of the EULA and third-party notices shipped with the installer; update them with each release.
- Screenshots in `assets/shots/` are taken from the app with demo data.
- Screen recordings in `assets/video/<lang>/` (VP9 WebM, poster = last frame) are recorded from the app with demo data; waits for agents are cut out. They play when scrolled into view and pause on click.
- The Pro early-bird form posts to the endpoint in `<meta name="pyloxa:waitlist">` on each page (Buttondown's `https://buttondown.com/api/emails/embed-subscribe/<username>`). While it is empty, the pricing table shows "sign-up opens soon" instead of the form.
