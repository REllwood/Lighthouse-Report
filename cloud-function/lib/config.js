/**
 * Reads the function's settings from environment variables. Set these on the Cloud Function, with secrets (PSI_API_KEY) coming from Secret Manager
 * @param env - The environment to read from, defaults to process.env
 * @returns {object}
 */
function loadConfig(env = process.env) {
    return {
        psiApiKey: env.PSI_API_KEY || '',
        bigQuery: {
            datasetId: env.BQ_DATASET || '',
            tableId: env.BQ_TABLE || '',
        },
    };
}

/**
 * Lists the environment variables that still need setting. BigQuery is optional, but needs both BQ_DATASET and BQ_TABLE if either is set
 * @param config - Output of loadConfig
 * @returns {string[]}
 */
function missingSettings(config) {
    const missing = [];
    if (config.bigQuery.datasetId && !config.bigQuery.tableId) missing.push('BQ_TABLE');
    if (config.bigQuery.tableId && !config.bigQuery.datasetId) missing.push('BQ_DATASET');
    return missing;
}

/**
 * True when results should be loaded into BigQuery
 * @param config - Output of loadConfig
 * @returns {boolean}
 */
function bigQueryEnabled(config) {
    return Boolean(config.bigQuery.datasetId && config.bigQuery.tableId);
}

module.exports = { loadConfig, missingSettings, bigQueryEnabled };
