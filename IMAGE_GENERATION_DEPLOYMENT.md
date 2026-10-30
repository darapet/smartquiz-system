# Image generation deployment

The browser client uses the Firebase creatorImageGenerate function as its only image engine.
The function already includes CORS headers and is configured for the smartquiz-darapet Firebase project.

## Deploy the Firebase function

From the repository root:

npm install -g firebase-tools
firebase login
firebase use smartquiz-darapet
npm install --prefix functions --no-audit --no-fund
firebase deploy --only functions:creatorImageGenerate --project smartquiz-darapet

After deployment, verify the endpoint returns CORS headers:

curl -i -X OPTIONS \
  -H "Origin: https://darapet.github.io" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  "https://us-central1-smartquiz-darapet.cloudfunctions.net/creatorImageGenerate"

The response should be HTTP 204 and include Access-Control-Allow-Origin: *.
Do not put Gemini keys in this repository or in browser JavaScript; the function reads them from the existing Admin Settings key pool.

## GitHub Pages fallback

The GitHub Pages client currently sets Cloudflare Workers AI as its active engine because the Firebase function must be deployed separately. Once `creatorImageGenerate` is deployed successfully, set `firebaseEnabled: true`, `remoteHistoryEnabled: true`, and `preferredEngine: 'gemini'` in `image-gen.html` to re-enable Gemini generation and server-side history.
