# Ortho Ward Board — Vercel + Google Sheets

Folder contents
  api/            server code Vercel runs (index page, Google Sheets calls)
  board/          the board itself (index.html)
  public/         empty static folder (keeps project files from being served)
  server.js       optional: run the same board on your own computer (npm start)
  .env            your settings and Google key — fill in GOOGLE_PRIVATE_KEY
  vercel.json     Vercel routing settings
  package.json    dependencies

Before deploying
  1. Fill in GOOGLE_PRIVATE_KEY in .env (from the service-account key file).
  2. Share the Google Sheet as Editor with GOOGLE_CLIENT_EMAIL.

Deploy (recommended — no GitHub, keeps .env private)
  Open a terminal in this folder and run:
      npx vercel --prod
  Answer the questions (log in, "Set up and deploy" = yes, keep defaults).
  The .env file is uploaded privately with the code and read by the server.

Deploy with GitHub instead
  Upload everything EXCEPT .env to a private repository, import it in Vercel,
  and paste the contents of .env into Settings → Environment Variables.

Run on your own computer
      npm install
      npm start
