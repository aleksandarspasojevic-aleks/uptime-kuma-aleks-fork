# Test Certificates

These certificates are NOT committed to the repository for security reasons.

Generate your own self-signed test certs before running the manual RADIUS TLS test:

```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout redis.key -out redis.crt \
  -days 365 -subj "/CN=localhost"
```
