# Google sign-in setup

The workspace now requires Google sign-in before reading project data or making changes. The server verifies ID tokens with Google's library and uses an HttpOnly session cookie. Sessions expire after eight hours or when the server restarts. Only the booking owner can cancel their booking. Existing records without an owner remain readable after login but cannot be cancelled through the UI.

## One-time Google configuration

1. Open https://console.cloud.google.com/auth/clients and select your Google Cloud project.
2. Configure the Google Auth Platform branding and audience; when testing, add your own Google email as a test user if required.
3. Create a client of type **Web application**.
4. Add **http://localhost:4173** to **Authorized JavaScript origins**.
5. Copy `auth.config.example.json` to `auth.config.json` and replace the placeholder with the client ID. No client secret is needed for this sign-in flow. The client ID is public configuration.
6. Run `npm install` then `npm start`. Visit **http://localhost:4173**, not the HTML file or the 127.0.0.1 alias.

Alternatively provide the client ID through the GOOGLE_CLIENT_ID environment variable. For hosting, set APP_ORIGIN to the exact HTTPS origin and register that origin in Google. This local service uses in-memory sessions and JSON storage; shared production hosting needs a shared session/database store.

Sign-in only verifies identity. It does not grant Gmail or Drive access. Each user can separately connect their own Gmail from Book support with the `gmail.send` scope. The server verifies that the access token belongs to the same signed-in user and keeps it only in memory; it is never written to `data.json`. A booking created without Gmail authorization is still saved and marked `needs_authorization`, so the owner can connect Gmail and retry. Staff email routing requires verified roster email addresses; until they are configured, a confirmation is sent from the requester to the requester. Chat connector authorizations are not website credentials.

Reference: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
