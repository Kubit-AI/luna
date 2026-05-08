'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { substituteKubitMarkers, copySkillSibling, KUBIT_MCP_URL } = require('../bin/install.js');

(function testSubstituteKubitMarkersUnit() {
  const body = 'runtime={{KUBIT_RUNTIME}} dir={{KUBIT_CONFIG_DIR}} scope={{KUBIT_SCOPE}}';
  const ctx = {
    runtime: 'claude',
    configDir: '/tmp/cfg',
    scope: 'global',
  };
  const out = substituteKubitMarkers(body, ctx);
  assert.strictEqual(
    out,
    'runtime=claude dir=/tmp/cfg scope=global',
    `unexpected substitution output: ${out}`
  );
  assert.ok(!out.includes('{{'), 'template markers left unresolved');
})();

(function testCopySkillSiblingSubstitutesMarkdown() {
  // Skills like kubit-blame and kubit-integrate embed {{KUBIT_*}} markers
  // under references/, not in SKILL.md. copySkillSibling must substitute
  // on every .md file it encounters (including nested directories) while
  // leaving non-.md files byte-for-byte.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kubit-sibling-'));
  try {
    const src = path.join(tmp, 'src');
    const dest = path.join(tmp, 'dest');
    fs.mkdirSync(path.join(src, 'references', 'frameworks'), { recursive: true });
    fs.writeFileSync(
      path.join(src, 'references', 'README.md'),
      'cfg={{KUBIT_CONFIG_DIR}}'
    );
    fs.writeFileSync(
      path.join(src, 'references', 'frameworks', 'fixture.md'),
      '# header {{KUBIT_CONFIG_DIR}}\nrt: "{{KUBIT_RUNTIME}}"'
    );
    const raw = Buffer.from([0x00, 0x7b, 0x7b, 0xff]); // contains literal "{{" bytes
    fs.writeFileSync(path.join(src, 'binary.bin'), raw);

    const ctx = {
      runtime: 'claude',
      configDir: '/tmp/cfg',
      scope: 'global',
    };
    copySkillSibling(path.join(src, 'references'), path.join(dest, 'references'), ctx);
    copySkillSibling(path.join(src, 'binary.bin'), path.join(dest, 'binary.bin'), ctx);

    const readmeOut = fs.readFileSync(path.join(dest, 'references', 'README.md'), 'utf8');
    assert.strictEqual(readmeOut, 'cfg=/tmp/cfg');

    const fixtureOut = fs.readFileSync(path.join(dest, 'references', 'frameworks', 'fixture.md'), 'utf8');
    assert.ok(!fixtureOut.includes('{{'), 'nested .md still has unresolved markers');
    assert.strictEqual(fixtureOut, '# header /tmp/cfg\nrt: "claude"');

    const binaryOut = fs.readFileSync(path.join(dest, 'binary.bin'));
    assert.deepStrictEqual(binaryOut, raw, 'non-.md file was mutated');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();

(function testKubitMcpUrlShape() {
  // KUBIT_MCP_URL is the only endpoint baked into the shipped install.js.
  assert.strictEqual(KUBIT_MCP_URL, 'https://agent.kubit.ai/mcp');
})();

(function testInstallerHasNoInternalArtifacts() {
  // Static guards against regressions that would re-introduce flavor wiring
  // or non-prod hostnames into the shipped installer.
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'install.js'), 'utf8');
  for (const banned of ['KUBIT_FLAVOR', 'KUBIT_OTEL_ENDPOINT', 'PROD_FLAVOR', 'resolveFlavor', 'non-prod-flavors']) {
    assert.ok(!src.includes(banned), `bin/install.js must not contain '${banned}'`);
  }
  for (const host of ['otel-int', 'otel-stg', 'otel-dev', 'agent-int', 'agent-stg']) {
    assert.ok(!src.includes(host), `bin/install.js must not reference '${host}'`);
  }
})();

console.log('ok - install markers and prod constants');
