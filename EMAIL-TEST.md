# Gmail booking emails

Each signed-in user can connect their own Gmail from Book support. The server verifies that the Gmail token belongs to the same Google account used for website sign-in, stores that authorization only in server memory, and uses that account's `users/me/messages/send` endpoint for that user's bookings. It never reuses another user's Gmail token.

The current roster has names but no verified staff email addresses. Until those addresses are configured, each booking email is sent from the requester to the requester as a confirmation. The booking record already keeps the selected Integration member, so a later roster-email mapping can route the message to that staff member without changing the booking flow.

Sign in with Google, open Book support, click Connect your Gmail, and approve only Gmail sending. The website does not request inbox reading. Then confirm a slot. The message includes the selected staff member, requesting team, time in America/New_York, topic, description, sender, recipient and booking ID.

If a user does not connect Gmail, the booking is still saved and the notification is marked `needs_authorization`. The booking owner can connect Gmail and retry. If the network outcome is uncertain, the status is `unknown`; check Gmail Sent before retrying to avoid duplicates. Cancelling a booking releases the slot but does not send a cancellation email.

The Google OAuth app remains in testing mode, so each allowed user must be an eligible Google test user. Gmail API must be enabled in `kpmg-practicum-integration`. The existing web client allows `http://localhost:4173`.

Run `node --test mail.test.js`. Tests use a temporary database and mocked delivery; they never send live email.
