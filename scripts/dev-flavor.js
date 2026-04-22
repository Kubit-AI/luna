'use strict';

// Development flavor override for bin/install.js. Present in the source
// tree, excluded from the published tarball (package.json#files does not
// list scripts/). install.js does a try/require on this module; when it
// resolves, the installer points at internal dev endpoints. When it
// doesn't (published package), install.js falls back to PROD_FLAVOR.
module.exports = {
  exportEndpoint: 'https://kubit-ingest-dev.kubit.ai/token',
  mcpUrl: 'https://agent-int.kubit.ai/mcp',
};
