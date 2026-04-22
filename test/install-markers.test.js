'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { substituteKubitMarkers, copySkillSibling, PROD_FLAVOR, resolveFlavor } = require('../bin/install.js');

(function testSubstituteKubitMarkersUnit() {
  const body = 'runtime={{KUBIT_RUNTIME}} dir={{KUBIT_CONFIG_DIR}} scope={{KUBIT_SCOPE}} endpoint={{KUBIT_EXPORT_ENDPOINT}}';
  const ctx = {
    runtime: 'claude',
    configDir: '/tmp/cfg',
    scope: 'global',
    exportEndpoint: 'https://example.test/token',
  };
  const out = substituteKubitMarkers(body, ctx);
  assert.strictEqual(
    out,
    'runtime=claude dir=/tmp/cfg scope=global endpoint=https://example.test/token',
    `unexpected substitution output: ${out}`
  );
  assert.ok(out.includes('https://example.test/token'), 'endpoint not substituted');
  assert.ok(!out.includes('{{'), 'template markers left unresolved');
})();

(function testCopySkillSiblingSubstitutesMarkdown() {
  // Skills like kubit-integrate embed {{KUBIT_*}} markers under references/,
  // not in SKILL.md. copySkillSibling must substitute on every .md file it
  // encounters (including nested directories) while leaving non-.md files
  // byte-for-byte.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kubit-sibling-'));
  try {
    const src = path.join(tmp, 'src');
    const dest = path.join(tmp, 'dest');
    fs.mkdirSync(path.join(src, 'references', 'frameworks'), { recursive: true });
    fs.writeFileSync(
      path.join(src, 'references', 'README.md'),
      'endpoint={{KUBIT_EXPORT_ENDPOINT}}'
    );
    fs.writeFileSync(
      path.join(src, 'references', 'frameworks', 'fixture.md'),
      '# header {{KUBIT_EXPORT_ENDPOINT}}\ntoken: "{{KUBIT_EXPORT_ENDPOINT}}"'
    );
    const raw = Buffer.from([0x00, 0x7b, 0x7b, 0xff]); // contains literal "{{" bytes
    fs.writeFileSync(path.join(src, 'binary.bin'), raw);

    const ctx = {
      runtime: 'claude',
      configDir: '/tmp/cfg',
      scope: 'global',
      exportEndpoint: 'https://example.test/token',
    };
    copySkillSibling(path.join(src, 'references'), path.join(dest, 'references'), ctx);
    copySkillSibling(path.join(src, 'binary.bin'), path.join(dest, 'binary.bin'), ctx);

    const readmeOut = fs.readFileSync(path.join(dest, 'references', 'README.md'), 'utf8');
    assert.strictEqual(readmeOut, 'endpoint=https://example.test/token');

    const fixtureOut = fs.readFileSync(path.join(dest, 'references', 'frameworks', 'fixture.md'), 'utf8');
    assert.ok(!fixtureOut.includes('{{'), 'nested .md still has unresolved markers');
    assert.strictEqual(
      fixtureOut,
      '# header https://example.test/token\ntoken: "https://example.test/token"'
    );

    const binaryOut = fs.readFileSync(path.join(dest, 'binary.bin'));
    assert.deepStrictEqual(binaryOut, raw, 'non-.md file was mutated');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();

(function testProdFlavorShape() {
  // PROD_FLAVOR is the only endpoint pair baked into the shipped install.js.
  // It must be complete, https, and must not carry the internal dev host.
  assert.ok(/^https:\/\//.test(PROD_FLAVOR.exportEndpoint), 'prod exportEndpoint must be https');
  assert.ok(/^https:\/\//.test(PROD_FLAVOR.mcpUrl), 'prod mcpUrl must be https');
  assert.ok(!PROD_FLAVOR.exportEndpoint.includes('-dev'), 'prod must not reference the dev ingest host');
  assert.ok(!PROD_FLAVOR.mcpUrl.includes('agent-int'), 'prod must not reference the dev MCP host');
})();

(function testResolveFlavorUsesDevInSourceTree() {
  // In the repo checkout scripts/dev-flavor.js exists, so resolveFlavor
  // returns its values. If this fails, the dev-flavor module went missing
  // from the source tree — which would let local dev installs hit prod.
  const devPath = path.join(__dirname, '..', 'scripts', 'dev-flavor.js');
  assert.ok(fs.existsSync(devPath), `scripts/dev-flavor.js must exist in source tree (expected at ${devPath})`);
  const resolved = resolveFlavor();
  assert.ok(resolved.exportEndpoint.includes('kubit-ingest-dev'), `expected dev ingest host, got ${resolved.exportEndpoint}`);
  assert.ok(resolved.mcpUrl.includes('agent-int'), `expected dev MCP host, got ${resolved.mcpUrl}`);
})();

(function testResolveFlavorFallsBackToProdWhenDevFlavorMissing() {
  // Simulate a published tarball: the scripts/ directory isn't shipped, so
  // the require inside resolveFlavor() throws. Emulate this by temporarily
  // renaming the dev-flavor module and clearing Node's require cache.
  const devPath = path.join(__dirname, '..', 'scripts', 'dev-flavor.js');
  const stashPath = devPath + '.stash';
  fs.renameSync(devPath, stashPath);
  const cached = require.resolve(devPath);
  delete require.cache[cached];
  try {
    const resolved = resolveFlavor();
    assert.strictEqual(resolved, PROD_FLAVOR, 'missing dev-flavor.js must fall back to PROD_FLAVOR');
  } finally {
    fs.renameSync(stashPath, devPath);
    delete require.cache[cached];
  }
})();

console.log('ok - endpoint marker wired');
