# @goodmorning/gm-pwa

Reusable React runtime for GoodMorning PWAs. It owns the install prompt, iOS instructions, online/offline status, service-worker registration, update notification and user-initiated activation. Products own only their manifest/service-worker build configuration and app version.

The runtime never intercepts API/auth requests; products must configure their service worker so non-GET, credentialed, `/api/`, and `/auth/` requests remain network-only.
