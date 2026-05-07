'use strict';

// Non-prod flavor map for bin/install.js. Present in the source tree,
// excluded from the published tarball (package.json#files does not list
// scripts/). install.js does a try/require on this module: when it
// resolves, KUBIT_FLAVOR (default 'int') indexes into the map; when it
// doesn't (published package), install.js falls back to PROD_FLAVOR.
//
// To add a new non-prod environment, add a key here. The keys themselves
// are the allowlist — install.js does not need a separate constant.
module.exports = {
  int: {
    otelEndpoint: 'https://otel-int.kubit.ai/v1/traces',
    mcpUrl: 'https://agent-int.kubit.ai/mcp',
  },
  stg: {
    otelEndpoint: 'https://otel-stg.kubit.ai/v1/traces',
    mcpUrl: 'https://agent-stg.kubit.ai/mcp',
  },
};
