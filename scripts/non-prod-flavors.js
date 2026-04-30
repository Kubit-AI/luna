'use strict';

// Non-prod flavor map for bin/install.js. Present in the source tree,
// excluded from the published tarball (package.json#files does not list
// scripts/). install.js does a try/require on this module: when it
// resolves, KUBIT_FLAVOR (default 'int') indexes into the map; when it
// doesn't (published package), install.js falls back to PROD_FLAVOR.
//
// To add a new non-prod environment, add a key here. The keys themselves
// are the allowlist — install.js does not need a separate constant.
//
// Replace the stg placeholders below with the real staging hostnames
// before running an install with KUBIT_FLAVOR=stg.
module.exports = {
  int: {
    exportEndpoint: 'https://kubit-ingest-dev.kubit.ai/token',
    mcpUrl: 'https://agent-int.kubit.ai/mcp',
  },
  stg: {
    exportEndpoint: 'https://kubit-ingest-dev.kubit.ai/token',
    mcpUrl: 'https://agent-stg.kubit.ai/mcp',
  },
};
