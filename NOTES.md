# Goal

This repo started off as a proof-of-concept that the WeScheme compiler
and runtime could be separated from its UI in an easy-to-embed way with
a simple React wrapper UI.

My intention is to add back in the Google Drive integration so that this
can form the foundation of a new version of the public WeScheme editor.

# Scope

- Core Google Drive Integration
    - log in
    - read/write Scheme files on Drive
    - grant WeScheme access to images on Drive

---

# Notes

For the sake of future maintainers, I am keeping this liveblog of notes
of assumptions I make and docs I read as I try to get things working.

- Ok, so how does Google want us to do authe/authn/API calls now?
  - Reading Overview: https://developers.google.com/drive/api/guides/about-sdk
  - Reading Quickstart: https://developers.google.com/drive/api/quickstart/js

  - Project setup
    - Make a new project in Google Cloud Console
    - Search for "Google Drive API" and click "Enable"
    - Set up authorization
      - Create app and pick scopes
        - In APIS & Services > OAuth Consent Screen: "Create app"
        - Enter name, support email, domain, etc.
        - Pick Scopes: "Google Drive API .. ./auth/docs"
        - Add Test users by email (added myself and schanzer@bootstrapworld.org)
      - Create OAuth client id
        - APIs & Services > Credentials > + Create Credentials > OAuth Client Id
        - Create new web client id. Add allowlisted domains.
        - Note down client id and secret.
      - Create api key
        - APIs & Services > Credentials > + Create Credentials > API Key
        - Note down API key. 

  - Auth code
    - Mostly stealing the code from the JS Quickstart
      - Because we're using webpack, I had to rewrite all the callback functions from `function name() {...` to `window.name = function(){...`.
    - At this point, Google code runs and correctly shows logged-out state.
      - But, clicking to log in leads to an oauth redirect error (because we're on localhost)
      - Let's fix this so we have a public URL in dev:
        - Install ngrok (give a public https endpoint for local dev)
          - Run `ngrok http https://localhost:8080` to expose local dev
          - Find forwarding URL (some-long-id.ngrok.io) and use that
        - Now webpack-dev-server fails with "Invalid Host Header"
          - It doesn't like being proxied.
          - So I had to add `disableHostCheck` in webpack.config.js
        - Need to add ngrok url to both JS origin and redirect domains allowed on project (on the OAuth Client Id)

    - At this point, the page appears, I can do the oauth redirect flow, accept permissions, and arrive back at a logged-in state.
      

---