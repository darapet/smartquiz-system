# SmartQuiz network troubleshooting

The web app is published as a static GitHub Pages site, while authentication,
quiz data, realtime challenges, and storage are provided by Firebase.

## What was fixed in this release

- The main site's browser Firebase SDK modules are loaded from the official
  `www.gstatic.com` CDN, matching the mobile and admin builds.
- Firestore uses HTTPS long-polling on the web. This is slower than the default
  transport but works on networks that break WebSockets or HTTP/2 streams.
- A connection message is shown instead of leaving the first screen stuck when
  the browser is offline or a required request is blocked.

## Firebase Console checklist

In Firebase Console → Authentication → Settings → Authorized domains, add:

- `darapet.github.io`
- the exact custom domain, if one is used

Also confirm that Authentication, Firestore, and Realtime Database are enabled
for the `smartquiz-darapet` project and that the rules in `firestore.rules`
have been published.

## Cloudflare settings

If the site is being served through a Cloudflare custom domain:

- Set SSL/TLS encryption mode to **Full (strict)**, not **Flexible**.
- Do not create a redirect rule that sends every path to `register.html`.
- Do not cache `register.html`, `login.html`, or authentication JavaScript
  more aggressively than the origin cache headers.
- After publishing new files, purge the Cloudflare cache once and test in a
  private browser window.

The registration flow also protects against a session-restore race: after a
successful Firebase account creation, the dashboard is allowed time to restore
the new session instead of immediately redirecting back to `register.html`.

## If it still requires a VPN

Open the browser developer console and check which hostname fails:

- `www.gstatic.com`: the bundled SDK fix should resolve this after the latest
  GitHub Pages deployment and a hard refresh.
- `firestore.googleapis.com`, `identitytoolkit.googleapis.com`,
  `securetoken.googleapis.com`, or `*.firebaseio.com`: the network is blocking
  Firebase's data services, not the website itself. A static GitHub Pages
  client cannot bypass that restriction. The durable solution is to move the
  data/auth API behind a reachable HTTPS backend or use a network/provider that
  allows these hosts.
- `api.groq.com`, `text.pollinations.ai`, or `audio.pollinations.ai`: only the
  corresponding AI feature is blocked; sign-in and quiz data should still work.

Do not put a VPN key, Firebase service-account key, Groq key, or any other
private credential in the browser code. Firebase web configuration values are
client identifiers, but server credentials must stay on a backend.