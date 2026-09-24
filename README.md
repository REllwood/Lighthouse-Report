
# Lighthouse-Report

Lighthouse is a quick and easy way to analyse web apps and web pages, collecting modern performance metrics and insights on developer best practices.

Lighthouse-Report uses Lighthouse to run performance reports on a list of URLs, returning the results in multiple formats to be used at a later date for analysis or review. There are two ways to run it:

| | Local runner (`main.js`) | Cloud Function (`cloud-function/`) |
|---|---|---|
| Where Lighthouse runs | On your machine, in headless Chrome | On Google's servers, via the PageSpeed Insights API |
| Input | URLs on the command line | A JSON `POST` request |
| Output | The full Lighthouse report as a PDF per URL, in `Reports/` | A row per URL in BigQuery (optional), a PDF summary emailed to you, and the results as JSON |

## Acknowledgements

- [Lighthouse](https://github.com/GoogleChrome/lighthouse)
- [PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started)

## Authors

- [@REllwood](https://github.com/REllwood)


## Local runner

Needs Node.js 22.19 or later and Google Chrome (or Chromium) installed.

```bash
npm install
node main.js https://example.com https://example.com/about
# or
npm run report -- https://example.com
```

Each URL is saved as a PDF of the full Lighthouse performance report, eg. `Reports/example.com.pdf` and `Reports/example.com_about.pdf`. If a URL fails, the rest still run and the command exits with code 1.

| Environment variable | Default | Description |
|---|---|---|
| `REPORTS_DIR` | `Reports` | Folder the PDFs are saved to |
| `CHROME_PATH` | Found automatically | Path to Chrome, if it isn't installed in the usual place |
| `CHROME_FLAGS` | | Extra Chrome flags, eg. `--no-sandbox` when running as root in Docker |

`start(urls)` and `runReport(url)` are also exported if you want to call them from your own code.


## Cloud Function

The function takes an array of URLs and an email address, runs each URL through PageSpeed Insights (mobile or desktop), loads the results into a BigQuery table if you've set one up, then emails a PDF report of the run and returns the results as JSON.

### Setting it up

1. **PageSpeed Insights API key.** In the Google Cloud console, enable the PageSpeed Insights API and create an API key (restrict it to that API).
2. **Email account.** For Gmail, turn on 2-Step Verification and create an [App Password](https://myaccount.google.com/apppasswords); your normal Gmail password will be rejected. Any other SMTP provider works too, see the settings below.
3. **Store the secrets in Secret Manager:**
   ```bash
   printf '%s' 'YOUR_PSI_API_KEY' | gcloud secrets create psi-api-key --data-file=-
   printf '%s' 'YOUR_APP_PASSWORD' | gcloud secrets create smtp-pass --data-file=-
   ```
4. **BigQuery (optional).** Create a dataset and a table using the schema in this repo:
   ```bash
   bq mk --dataset PROJECT_ID:web_performance
   bq mk --table PROJECT_ID:web_performance.lighthouse cloud-function/bigquery-schema.json
   ```
5. **Deploy.** `--no-allow-unauthenticated` means only people and services you grant access to can call it, so nobody else can send email through your account or use up your quota:
   ```bash
   gcloud functions deploy run_lighthouse \
     --gen2 \
     --runtime=nodejs22 \
     --region=australia-southeast1 \
     --source=cloud-function \
     --entry-point=run_lighthouse \
     --trigger-http \
     --no-allow-unauthenticated \
     --timeout=300s \
     --memory=512Mi \
     --set-env-vars=SMTP_USER=you@gmail.com,BQ_DATASET=web_performance,BQ_TABLE=lighthouse \
     --set-secrets=PSI_API_KEY=psi-api-key:latest,SMTP_PASS=smtp-pass:latest
   ```
   The function's service account needs the **Secret Manager Secret Accessor** role on both secrets and, if you use BigQuery, **BigQuery Data Editor** on the dataset.
6. **Let people call it:**
   ```bash
   gcloud functions add-invoker-policy-binding run_lighthouse \
     --region=australia-southeast1 \
     --member=user:someone@example.com
   ```

### Usage/Examples

```bash
curl -X POST "$(gcloud functions describe run_lighthouse --region=australia-southeast1 --format='value(serviceConfig.uri)')" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://example.com", "https://example2.com"], "email": "example@gmail.com"}'
```

The request body is JSON:

| Field | Required | Description |
|---|---|---|
| `urls` | Yes | Array of `http://` or `https://` URLs to report on, up to `MAX_URLS` (10 by default). Duplicates are removed. |
| `email` | Yes | A single email address to send the PDF report to |
| `strategy` | No | `mobile` (default) or `desktop` |

A successful run returns `200` with the results:

```json
{
  "message": "Lighthouse report sent to example@gmail.com",
  "results": [
    {
      "url": "https://example.com/",
      "finalUrl": "https://example.com/",
      "strategy": "mobile",
      "fetchedAt": "2026-09-24T01:00:00.000Z",
      "lighthouseVersion": "13.5.0",
      "performanceScore": 87,
      "firstContentfulPaintMs": 1210.5,
      "largestContentfulPaintMs": 2830.5,
      "totalBlockingTimeMs": 312,
      "speedIndexMs": 1840.2,
      "cumulativeLayoutShift": 0.042
    }
  ],
  "failures": []
}
```

URLs that PageSpeed Insights couldn't analyse are listed in `failures` (and in the email) with the reason, and the rest are still reported. Other responses:

| Status | When |
|---|---|
| `400` | The body is invalid, `errors` lists every problem |
| `405` | The request wasn't a `POST` |
| `500` | A setting is missing (the logs say which), or saving to BigQuery or sending the email failed |
| `502` | None of the URLs could be analysed, `failures` says why |

### Settings

| Environment variable | Required | Default | Description |
|---|---|---|---|
| `PSI_API_KEY` | Yes | | PageSpeed Insights API key (use Secret Manager) |
| `SMTP_USER` | Yes | | Email account to send from |
| `SMTP_PASS` | Yes | | Its password, eg. a Gmail App Password (use Secret Manager) |
| `SMTP_HOST` | No | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | No | `465` | SMTP port. `465` uses SSL, other ports use STARTTLS |
| `MAIL_FROM` | No | `SMTP_USER` | From address, eg. `Lighthouse Reports <you@gmail.com>` |
| `BQ_DATASET` | No | | BigQuery dataset. Set it with `BQ_TABLE` to load the results into BigQuery |
| `BQ_TABLE` | No | | BigQuery table, created from `cloud-function/bigquery-schema.json` |
| `MAX_URLS` | No | `10` | Most URLs allowed in one request |

Each row in BigQuery has the URL, final URL after redirects, strategy, when it was tested, Lighthouse version, performance score out of 100, and First Contentful Paint, Largest Contentful Paint, Total Blocking Time and Speed Index in milliseconds, plus Cumulative Layout Shift.

### Running it locally

```bash
cd cloud-function
npm install
PSI_API_KEY=your-key SMTP_USER=you@gmail.com SMTP_PASS=your-app-password npm start
```

Then send requests to `http://localhost:8080` as above, without the `Authorization` header.


## Tests

```bash
npm test                        # local runner
cd cloud-function && npm test   # Cloud Function
```


## Roadmap

- Adding ability to export as CSV or JSON
- Ability to export to BigQuery - **Completed**
- Script to make this serverless so it can be deployed to a Cloud Function/Lambda - **Completed**
- Add option to deploy this as an API that will return results - **Completed** (the Cloud Function returns the results as JSON)


## License

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
