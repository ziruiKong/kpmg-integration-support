# KPMG Practicum — Integration Support

This is a working cross-team support workspace, not a presentation-only page.

## Run

```bash
node server.js
```

Open <http://localhost:4173>.

The first run creates `data.json`. Help requests, bookings, cancellations, and activity are persisted there.

## Features

- Overview: request help without seeing technical/API terminology.
- Book support: choose Olivia He, Jiahao Hu, Yinglin Wang, Yuhan Wang, or Zirui Kong.
- Conflict control: a booked slot is locked and duplicate bookings return `409`.
- Activity: show the selected member, time, team, topic, and notification choice.
- Roster: show all eight workstreams, leads, members, and focus.
- Notifications: store `email`, `shared-doc`, or `both` as a queued notification on each booking.

## Notification handoff

The booking flow is ready to hand off notifications. To send real email or write to a shared document, connect the queued notification records to an SMTP provider, Microsoft Graph, or Google Drive/Docs service.

This local version keeps the notification intent and destination. Production deployment should add authentication, a shared database, and the chosen email/shared-document connector.
