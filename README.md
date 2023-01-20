
# Lighthouse-Report

Lighthouse is quick and easy way to analyzes web apps and web pages, collecting modern performance metrics and insights on developer best practices.

Lighthouse-Reports uses Lighthouse to run reports, returning the results in multiple formats to be used at a later date for analysis or review.

If you want to run this in a Serverless Cloud Function, you will want to deploy the cloudFunction.js

The System currently takes in an array of URLs and an email address and loads the results of that reports into a specified BigQuery table and then emails the user a PDF report of the run.


## Acknowledgements

- [Lighthouse](https://github.com/GoogleChrome/lighthouse)

## Authors

- [@REllwood](https://github.com/REllwood)


## Usage/Examples
The main function to use for deployment is the cloudFunction.js file. An example of the request body to the cloud function would look like below
```javascript
{
    "urls": [
        "https://example.com",
        "https://example2.com"
    ],
        "email": "example@gmail.com"
}

```
The request body should be in JSON format with the urls as an array of URLs that you want to run a Lighthouse report on. 
<br>The email property should be a string representing the email address to which the PDF report should be sent.

**Notes:** You will want to specify BQ dataset, tableID, API Key, etc ENV variables in the cloud function.

## Roadmap

- Adding ability to export as CSV or JSON
- Ability to export to BigQuery - **Completed**
- Script to make this serverless so it can be deployed to a Cloud Function/Lambda - **Completed**
- Add option to deploy this as an API that will return results 


## License

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)


