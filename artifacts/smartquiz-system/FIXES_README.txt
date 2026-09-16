=== HOW TO FIX YOUR WEBSITE — TWO STEPS ===

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FIX 1 — Admin "Missing or insufficient permissions"
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Your Firestore Security Rules are blocking admin actions.
  You need to paste new rules in your Firebase Console.

  Steps:
  1. Go to https://console.firebase.google.com
  2. Select your project "smartquiz-darapet"
  3. In the left menu click: Firestore Database → Rules
  4. Delete ALL the existing rules
  5. Copy the ENTIRE contents of the file "firestore.rules"
     (included in this zip) and paste it in
  6. Click "Publish"

  That's it! All admin actions will now work.

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FIX 2 — Attendance showing too many records
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  The quiz submit button could fire multiple times (e.g. if 
  the timer ran out AND you clicked Submit at the same time, 
  it would record 2 attempts — or more if clicked repeatedly).

  This is now FIXED in the updated js/aqs-main.js file.
  The fix adds a guard so the quiz can only be submitted once
  per session, no matter how many times the button is clicked.

  To apply: Upload the updated files (especially js/aqs-main.js)
  to your hosting (GitHub Pages, etc.), replacing the old files.

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CLEANING UP OLD BAD ATTENDANCE RECORDS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  The duplicate records that already exist in Firestore can be 
  deleted from your Admin Panel → Quiz Results tab.
  Click Delete on any duplicate attempt rows.
  