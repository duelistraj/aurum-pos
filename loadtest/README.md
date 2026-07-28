# Aurum POS load test

This k6 scenario exercises the authenticated dashboard, inventory list, invoice list, and 30-day analytics paths that dominate normal shop traffic.
Use a dedicated cashier account and a non-production shop populated with representative inventory, sales, invoice, rate, and history volumes.
Do not point this test at production without an approved capacity window.

Run the launch-sized 100-user gate with:

```bash
K6_EMAIL=loadtest@example.com \
K6_PASSWORD='replace-me' \
K6_API_BASE=https://staging-api.example.com/api/v1 \
k6 run loadtest/k6.js
```

Set `K6_TARGET_VUS=10000` only after the API is running on multiple instances, workers are separated, and the database connection budget has been raised or pooled.
The test fails when request errors reach 1 percent, p95 latency reaches 500 ms, p99 latency reaches 1.5 seconds, or functional checks fall below 99 percent.
Record the application revision, database size, instance shape, pool settings, worker lag, CPU, memory, database load, and result summary for every capacity run.
