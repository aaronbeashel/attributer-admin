# Licensing CSV Report Endpoint

## Overview

The licensing server provides a CSV report of all domains that have loaded the Attributer script, with call counts. This is generated from CloudFront access logs.

## Endpoint

```
GET https://licenses.attributer.io/report.csv
```

## Authentication

HTTP Basic Auth — same credentials as the licensing server API:

```
Username: attributer
Password: attributer2024
```

## Response

CSV file with domain and call count data. Same format as the manually uploaded CSVs.

## Future Automation

Plan: Add a weekly cron job to the admin app that fetches this CSV automatically, runs it through the licensing pipeline, and stores results for review. Eliminates the need for manual CSV upload.
