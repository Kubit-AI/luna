'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { substituteKubitMarkers, copySkillSibling, PROD_FLAVOR, resolveFlavor } = require('../bin/install.js');

(function testSubstituteKubitMarkersUnit() {
  const body = 'runtime={{KUBIT_RUNTIME}} dir={{KUBIT_CONFIG_DIR}} scope={{KUBIT_SCOPE}} endpoint={{KUBIT_OTEL_ENDPOINT}}';
  const ctx = {
    runtime: 'claude',
    configDir: '/tmp/cfg',
    scope: 'global',
    otelEndpoint: 'https://example.test/v1/traces',
  };
  const out = substituteKubitMarkers(body, ctx);
  assert.strictEqual(
    out,
    'runtime=claude dir=/tmp/cfg scope=global endpoint=https://example.test/v1/traces',
    `unexpected substitution output: ${out}`
  );
  assert.ok(out.includes('https://example.test/v1/traces'), 'endpoint not substituted');
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
      'endpoint={{KUBIT_OTEL_ENDPOINT}}'
    );
    fs.writeFileSync(
      path.join(src, 'references', 'frameworks', 'fixture.md'),
      '# header {{KUBIT_OTEL_ENDPOINT}}\ntoken: "{{KUBIT_OTEL_ENDPOINT}}"'
    );
    const raw = Buffer.from([0x00, 0x7b, 0x7b, 0xff]); // contains literal "{{" bytes
    fs.writeFileSync(path.join(src, 'binary.bin'), raw);

    const ctx = {
      runtime: 'claude',
      configDir: '/tmp/cfg',
      scope: 'global',
      otelEndpoint: 'https://example.test/v1/traces',
    };
    copySkillSibling(path.join(src, 'references'), path.join(dest, 'references'), ctx);
    copySkillSibling(path.join(src, 'binary.bin'), path.join(dest, 'binary.bin'), ctx);

    const readmeOut = fs.readFileSync(path.join(dest, 'references', 'README.md'), 'utf8');
    assert.strictEqual(readmeOut, 'endpoint=https://example.test/v1/traces');

    const fixtureOut = fs.readFileSync(path.join(dest, 'references', 'frameworks', 'fixture.md'), 'utf8');
    assert.ok(!fixtureOut.includes('{{'), 'nested .md still has unresolved markers');
    assert.strictEqual(
      fixtureOut,
      '# header https://example.test/v1/traces\ntoken: "https://example.test/v1/traces"'
    );

    const binaryOut = fs.readFileSync(path.join(dest, 'binary.bin'));
    assert.deepStrictEqual(binaryOut, raw, 'non-.md file was mutated');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();

(function testProdFlavorShape() {
  // PROD_FLAVOR is the only endpoint pair baked into the shipped install.js.
  // It must be complete, https, and must not carry any non-prod host.
  assert.ok(/^https:\/\//.test(PROD_FLAVOR.otelEndpoint), 'prod otelEndpoint must be https');
  assert.ok(/^https:\/\//.test(PROD_FLAVOR.mcpUrl), 'prod mcpUrl must be https');
  assert.ok(!PROD_FLAVOR.otelEndpoint.includes('-dev'), 'prod must not reference the dev ingest host');
  assert.ok(!PROD_FLAVOR.otelEndpoint.includes('-stg'), 'prod must not reference the stg ingest host');
  assert.ok(!PROD_FLAVOR.mcpUrl.includes('agent-int'), 'prod must not reference the dev MCP host');
  assert.ok(!PROD_FLAVOR.mcpUrl.includes('agent-stg'), 'prod must not reference the stg MCP host');
})();

function withFlavorEnv(value, fn) {
  const prev = process.env.KUBIT_FLAVOR;
  if (value === undefined) delete process.env.KUBIT_FLAVOR;
  else process.env.KUBIT_FLAVOR = value;
  try { return fn(); }
  finally {
    if (prev === undefined) delete process.env.KUBIT_FLAVOR;
    else process.env.KUBIT_FLAVOR = prev;
  }
}

const NONPROD_PATH = path.join(__dirname, '..', 'scripts', 'non-prod-flavors.js');

(function testResolveFlavorUsesIntInSourceTree() {
  // In the repo checkout scripts/non-prod-flavors.js exists, so resolveFlavor
  // returns its 'int' entry when KUBIT_FLAVOR defaults to 'int'. If this
  // fails, the non-prod module went missing from the source tree — which
  // would let local dev installs silently hit prod.
  assert.ok(fs.existsSync(NONPROD_PATH), `scripts/non-prod-flavors.js must exist in source tree (expected at ${NONPROD_PATH})`);
  withFlavorEnv(undefined, () => {
    const resolved = resolveFlavor();
    assert.ok(resolved.otelEndpoint.includes('otel-int'), `expected int otel host, got ${resolved.otelEndpoint}`);
    assert.ok(resolved.mcpUrl.includes('agent-int'), `expected dev MCP host, got ${resolved.mcpUrl}`);
  });
})();

(function testResolveFlavorUsesStgWhenSelected() {
  // KUBIT_FLAVOR=stg returns the 'stg' entry from non-prod-flavors.js.
  delete require.cache[require.resolve(NONPROD_PATH)];
  withFlavorEnv('stg', () => {
    const resolved = resolveFlavor();
    const stgEntry = require(NONPROD_PATH).stg;
    assert.ok(stgEntry, 'non-prod-flavors.js must export a stg entry');
    assert.strictEqual(resolved.otelEndpoint, stgEntry.otelEndpoint, 'stg otelEndpoint mismatch');
    assert.strictEqual(resolved.mcpUrl, stgEntry.mcpUrl, 'stg mcpUrl mismatch');
  });
})();

(function testResolveFlavorFallsBackToProdWhenNonProdMapMissing() {
  // Simulate a published tarball: the scripts/ directory isn't shipped, so
  // the require inside resolveFlavor() throws. Emulate this by temporarily
  // renaming non-prod-flavors.js and clearing Node's require cache. Both
  // the default ('int') and KUBIT_FLAVOR=stg paths must fall back to PROD.
  const stashPath = NONPROD_PATH + '.stash';
  fs.renameSync(NONPROD_PATH, stashPath);
  const cached = require.resolve(NONPROD_PATH);
  delete require.cache[cached];
  try {
    withFlavorEnv(undefined, () => {
      assert.strictEqual(resolveFlavor(), PROD_FLAVOR, 'default flavor must fall back to PROD_FLAVOR when non-prod map is missing');
    });
    withFlavorEnv('stg', () => {
      assert.strictEqual(resolveFlavor(), PROD_FLAVOR, 'KUBIT_FLAVOR=stg must fall back to PROD_FLAVOR when non-prod map is missing');
    });
  } finally {
    fs.renameSync(stashPath, NONPROD_PATH);
    delete require.cache[cached];
  }
})();

(function testResolveFlavorRejectsUnknownFlavor() {
  // KUBIT_FLAVOR set to a value that isn't a key in non-prod-flavors.js
  // must fail fast (no silent fallback to prod) so a typo doesn't ship the
  // wrong installer URLs. Stub process.exit to throw so the test can
  // observe the fatal() call without killing the runner; silence
  // stderr.write to keep test output clean.
  const origExit = process.exit;
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  let exitCode = null;
  let stderrMsg = '';
  process.exit = (c) => { exitCode = c; throw new Error('exit-stub'); };
  process.stderr.write = (s) => { stderrMsg += s; return true; };
  try {
    withFlavorEnv('junk', () => {
      assert.throws(() => resolveFlavor(), /exit-stub/, 'expected fatal() to be invoked');
    });
    assert.strictEqual(exitCode, 1, `expected exit code 1, got ${exitCode}`);
    assert.ok(/unknown KUBIT_FLAVOR/.test(stderrMsg), `expected error message about unknown KUBIT_FLAVOR, got: ${stderrMsg}`);
  } finally {
    process.exit = origExit;
    process.stderr.write = origStderrWrite;
  }
})();

console.log('ok - endpoint marker wired');
