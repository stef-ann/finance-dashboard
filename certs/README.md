# Teller client certificate

Teller requires a mutual-TLS client certificate for every server-side API call
(sandbox included). The browser-side Teller Connect widget does **not** need it.

1. In the Teller dashboard open your application → **Certificates**.
2. Generate / download the certificate and private key.
3. Drop the two `.pem` files in this folder, e.g.:
   - `certs/certificate.pem`
   - `certs/private_key.pem`
4. Point `TELLER_CERT_PATH` / `TELLER_KEY_PATH` in `packages/server/.env` at them.

Everything in this folder except this README is git-ignored — the key never
leaves your machine.
