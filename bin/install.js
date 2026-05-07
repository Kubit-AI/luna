#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const PKG_ROOT = path.resolve(__dirname, '..');

// Production endpoints — the only flavor baked into the published tarball,
// and therefore the only URLs visible to anyone unpacking the npm package.
// Non-prod endpoints live in scripts/non-prod-flavors.js as a map keyed
// by flavor name. That file is NOT in package.json#files and so never
// ships. From the source tree, KUBIT_FLAVOR selects a key (default 'int');
// when `npx @kubit-ai/agent-plugin` runs from the tarball, the file is
// absent and PROD_FLAVOR wins regardless of KUBIT_FLAVOR.
// `KUBIT_OTEL_ENDPOINT=...` still overrides the resolved OTLP endpoint —
// used for internal testing against custom hosts.
const PROD_FLAVOR = {
  otelEndpoint: 'https://otel.kubit.ai/v1/traces',
  mcpUrl: 'https://agent.kubit.ai/mcp',
};

function resolveFlavor() {
  const name = process.env.KUBIT_FLAVOR || 'int';
  let flavors;
  try {
    // eslint-disable-next-line global-require
    flavors = require('../scripts/non-prod-flavors.js');
  } catch {
    // No non-prod module — running from a published tarball. KUBIT_FLAVOR
    // (if set) is ignored; only prod URLs are reachable in that environment.
    return PROD_FLAVOR;
  }
  const flavor = flavors[name];
  if (!flavor) {
    fatal(`unknown KUBIT_FLAVOR: ${name} (expected one of: ${Object.keys(flavors).join(', ')})`);
  }
  if (flavor.otelEndpoint && flavor.mcpUrl) {
    return flavor;
  }
  return PROD_FLAVOR;
}

const FLAVOR = resolveFlavor();
const KUBIT_OTEL_ENDPOINT =
  process.env.KUBIT_OTEL_ENDPOINT || FLAVOR.otelEndpoint;

// Explicit allowlist of agents that ship. Entries whose source file doesn't
// exist under agents/ yet are silently skipped (see the existsSync guards in
// installClaude/installCursor) — this lets the allowlist grow ahead of the
// files landing.
const SHIPPED_AGENTS = ['kubit-analyst', 'kubit-blame-mapper', 'kubit-blame-correlator'];

// Explicit allowlist of skills that ship. Source folders under `skills/` not
// listed here stay in the repo but are not installed. Keep this in sync with
// README.md, skills/help/SKILL.md, CHANGELOG.md, and CLAUDE.md.
const SHIPPED_SKILLS = ['kubit-blame', 'kubit-connect', 'kubit-help', 'kubit-inspect', 'kubit-report', 'kubit-update', 'kubit-integrate'];

const HELP = `kubit-agent-plugin — install the Kubit agent plugin into Claude Code and/or Cursor

Usage:
  npx @kubit-ai/agent-plugin [options]

The runtime (Claude Code, Cursor, or both) is chosen interactively unless
--runtime is supplied.

Location:
  -g, --global           (default) install to user config dir
  -l, --local            install to ./.claude or ./.cursor under cwd

Management:
  -u, --uninstall        Remove installed files for selected runtime(s)
  -y, --yes              Non-interactive; assume defaults
  -c, --config-dir <p>   Override the user config base dir (applies to Claude Code)
  -r, --runtime <name>   Skip the runtime prompt: claude, cursor, or both
  -h, --help             Show this help
`;

// ---------- flag parsing ----------

function parseArgs(argv) {
  const args = {
    global: false,
    local: false,
    uninstall: false,
    yes: false,
    help: false,
    configDir: null,
    runtime: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-g': case '--global': args.global = true; break;
      case '-l': case '--local': args.local = true; break;
      case '-u': case '--uninstall': args.uninstall = true; break;
      case '-y': case '--yes': args.yes = true; break;
      case '-h': case '--help': args.help = true; break;
      case '-c': case '--config-dir':
        args.configDir = argv[++i];
        if (!args.configDir) fatal(`${a} requires a path argument`);
        break;
      case '-r': case '--runtime':
        args.runtime = argv[++i];
        if (!args.runtime) fatal(`${a} requires a value: claude, cursor, or both`);
        if (!['claude', 'cursor', 'both'].includes(args.runtime)) {
          fatal(`${a}: unknown runtime '${args.runtime}' (expected claude, cursor, or both)`);
        }
        break;
      default:
        fatal(`unknown option: ${a}\n\n${HELP}`);
    }
  }
  return args;
}

// ---------- prompts ----------

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptChoice(question, choices, defaultIdx = 0) {
  const lines = choices.map((c, i) => `  ${i + 1}) ${c}${i === defaultIdx ? ' (default)' : ''}`);
  const raw = await prompt(`${question}\n${lines.join('\n')}\n> `);
  if (!raw) return defaultIdx;
  const n = parseInt(raw, 10);
  if (Number.isInteger(n) && n >= 1 && n <= choices.length) return n - 1;
  fatal(`invalid choice: ${raw}`);
}

// ---------- utilities ----------

function fatal(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function rmIfExists(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

// Reserve the kubit-* namespace: remove any skill dirs or agent files left
// over from previous versions that are no longer in the allowlist. Handles
// renames (kubit-instrument -> kubit-integrate) and removals automatically.
function pruneStaleInstalls(skillsDir, agentsDir, shippedSkills, shippedAgents) {
  const keepSkills = new Set(shippedSkills);
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir)) {
      if (entry.startsWith('kubit-') && !keepSkills.has(entry)) {
        rmIfExists(path.join(skillsDir, entry));
        log(`  pruned stale skill: ${entry}`);
      }
    }
  }
  const keepAgents = new Set(shippedAgents.map((n) => `${n}.md`));
  if (fs.existsSync(agentsDir)) {
    for (const entry of fs.readdirSync(agentsDir)) {
      if (entry.startsWith('kubit-') && entry.endsWith('.md') && !keepAgents.has(entry)) {
        rmIfExists(path.join(agentsDir, entry));
        log(`  pruned stale agent: ${entry}`);
      }
    }
  }
}

function removeAllKubitAgents(agentsDir) {
  if (!fs.existsSync(agentsDir)) return;
  for (const entry of fs.readdirSync(agentsDir)) {
    if (entry.startsWith('kubit-') && entry.endsWith('.md')) {
      rmIfExists(path.join(agentsDir, entry));
    }
  }
}

function expandHome(p) {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return p;
}

function readManifestVersion() {
  return readJson(path.join(PKG_ROOT, 'package.json')).version;
}

function writeVersionFile(metaDir, version) {
  fs.mkdirSync(metaDir, { recursive: true });
  fs.writeFileSync(path.join(metaDir, 'VERSION'), version + '\n');
}

function writeChangelogFile(metaDir) {
  const src = path.join(PKG_ROOT, 'CHANGELOG.md');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(metaDir, 'CHANGELOG.md'));
  }
}

// Config dirs get substituted into the update skill's bash heredocs, so
// anything that could escape a double-quoted string is a hard fail.
function assertSafeConfigDir(configDir) {
  if (/["`$\\]/.test(configDir)) {
    fatal(
      `config dir contains shell metacharacters: ${configDir}\n` +
        `use --config-dir with a plain POSIX path`
    );
  }
}

// Substitute the update skill's template markers. Safe on skills that don't
// use them — the replace passes are no-ops.
function substituteKubitMarkers(body, ctx) {
  return body
    .replace(/\{\{KUBIT_RUNTIME\}\}/g, ctx.runtime)
    .replace(/\{\{KUBIT_CONFIG_DIR\}\}/g, ctx.configDir)
    .replace(/\{\{KUBIT_SCOPE\}\}/g, ctx.scope)
    .replace(/\{\{KUBIT_OTEL_ENDPOINT\}\}/g, ctx.otelEndpoint);
}

// Recursively copy a file or directory from src to dest. Markdown files get
// Kubit template markers substituted; everything else is copied byte-for-byte.
// Skills that embed `{{KUBIT_*}}` markers in non-SKILL.md references (e.g.
// kubit-integrate's framework adapters) rely on this — a plain cpSync would
// leave their markers unresolved at install time.
function copySkillSibling(src, dest, ctx) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copySkillSibling(path.join(src, entry), path.join(dest, entry), ctx);
    }
    return;
  }
  if (src.endsWith('.md')) {
    const body = fs.readFileSync(src, 'utf8');
    fs.writeFileSync(dest, substituteKubitMarkers(body, ctx));
  } else {
    fs.copyFileSync(src, dest);
  }
}

// ---------- frontmatter ----------

// Returns { frontmatter: object|null, body: string }.
// Minimal YAML: supports simple `key: value` and `key: "value"` lines.
function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return { frontmatter: null, body: text };
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return { frontmatter: null, body: text };
  const raw = text.slice(4, end);
  const body = text.slice(end + 5);
  const fm = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    fm[m[1]] = v;
  }
  return { frontmatter: fm, body };
}

function writeFrontmatter(fm, body) {
  const lines = Object.entries(fm).map(([k, v]) => {
    if (typeof v === 'boolean' || typeof v === 'number') return `${k}: ${v}`;
    return `${k}: ${JSON.stringify(String(v))}`;
  });
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

// ---------- MCP merge ----------

// Merge our `.mcp.json` content into `targetMcpPath`, under key `kubit`.
// Preserves other mcpServers entries. Idempotent.
function mcpMerge(targetMcpPath) {
  // Constructed from the resolved flavor — the repo's source-tree `.mcp.json`
  // is not shipped, so we can't (and don't need to) read it at install time.
  const ourEntry = { type: 'http', url: FLAVOR.mcpUrl };

  let existing = { mcpServers: {} };
  if (fs.existsSync(targetMcpPath)) {
    try { existing = readJson(targetMcpPath); }
    catch (e) { fatal(`could not parse existing ${targetMcpPath}: ${e.message}`); }
    if (!existing.mcpServers || typeof existing.mcpServers !== 'object') {
      existing.mcpServers = {};
    }
  }
  existing.mcpServers.kubit = ourEntry;
  writeJson(targetMcpPath, existing);
}

function mcpRemoveKubit(targetMcpPath) {
  if (!fs.existsSync(targetMcpPath)) return;
  let existing;
  try { existing = readJson(targetMcpPath); }
  catch { return; }
  if (!existing.mcpServers) return;
  delete existing.mcpServers.kubit;
  const remaining = Object.keys(existing.mcpServers).length;
  if (remaining === 0 && Object.keys(existing).length === 1) {
    fs.rmSync(targetMcpPath);
  } else {
    writeJson(targetMcpPath, existing);
  }
}

// ---------- runtime: Claude Code ----------
//
// We install as loose skills + agent + user-scope MCP entry. Skills at
// ~/.claude/skills/<name>/SKILL.md and agents at ~/.claude/agents/<name>.md
// are auto-discovered by Claude Code. MCP user-scope config lives in
// ~/.claude.json (per GitHub issue #4976 — docs elsewhere that point to
// ~/.claude/settings.json are outdated).
//
// Skill namespace: we rewrite each skill's `name` frontmatter field to
// `kubit-<dir>` so invocation is `/kubit-connect` etc.

function claudeBase(args) {
  if (args.local) return path.resolve(process.cwd(), '.claude');
  if (args.configDir) return expandHome(args.configDir);
  if (process.env.CLAUDE_CONFIG_DIR) return expandHome(process.env.CLAUDE_CONFIG_DIR);
  return path.join(os.homedir(), '.claude');
}

function claudeSkillsDir(args) { return path.join(claudeBase(args), 'skills'); }
function claudeAgentsDir(args) { return path.join(claudeBase(args), 'agents'); }

// User-scope MCP lives at ~/.claude.json (NOT ~/.claude/settings.json).
// Project-scope lives at ./.mcp.json.
function claudeMcpPath(args) {
  if (args.local) return path.resolve(process.cwd(), '.mcp.json');
  return path.join(os.homedir(), '.claude.json');
}

// Apply Kubit marker substitution to a Claude Code SKILL.md. Frontmatter is
// authoritative in source — `name` already matches the kubit-* dir.
function transformSkillForClaude(skillMd, ctx) {
  return substituteKubitMarkers(skillMd, ctx);
}

async function installClaude(args) {
  const configBase = claudeBase(args);
  const skillsDir = claudeSkillsDir(args);
  const agentsDir = claudeAgentsDir(args);
  const mcpPath = claudeMcpPath(args);
  const metaDir = path.join(configBase, 'kubit');
  const version = readManifestVersion();

  assertSafeConfigDir(configBase);

  log(`\n[claude-code] version: ${version}`);
  log(`[claude-code] skills:  ${skillsDir}`);
  log(`[claude-code] agents:  ${agentsDir}`);
  log(`[claude-code] mcp:     ${mcpPath}`);

  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  const srcSkillsDir = path.join(PKG_ROOT, 'skills');
  const skillNames = SHIPPED_SKILLS.filter((n) =>
    fs.existsSync(path.join(srcSkillsDir, n, 'SKILL.md'))
  );

  // Clean install: remove every `kubit-*` skill dir and agent file. This
  // reserves the `kubit-*` namespace for the plugin and — importantly —
  // prunes renamed/dropped entries from prior versions (e.g. kubit-instrument
  // → kubit-integrate) instead of leaving orphans behind.
  pruneStaleInstalls(skillsDir, agentsDir, skillNames, SHIPPED_AGENTS);
  for (const name of skillNames) {
    rmIfExists(path.join(skillsDir, name));
  }
  for (const name of SHIPPED_AGENTS) {
    rmIfExists(path.join(agentsDir, `${name}.md`));
  }
  rmIfExists(metaDir);

  const ctx = {
    runtime: 'claude',
    configDir: configBase,
    scope: args.local ? 'local' : 'global',
    otelEndpoint: KUBIT_OTEL_ENDPOINT,
  };

  for (const name of skillNames) {
    const srcDir = path.join(srcSkillsDir, name);
    const src = path.join(srcDir, 'SKILL.md');
    if (!fs.existsSync(src)) continue;
    const destDir = path.join(skillsDir, name);
    fs.mkdirSync(destDir, { recursive: true });
    // Copy every sibling file/dir next to SKILL.md (e.g. references/). Markdown
    // files get marker substitution; other files are byte-for-byte.
    for (const entry of fs.readdirSync(srcDir)) {
      if (entry === 'SKILL.md') continue;
      copySkillSibling(path.join(srcDir, entry), path.join(destDir, entry), ctx);
    }
    // SKILL.md gets marker substitution; frontmatter is authoritative in source.
    const transformed = transformSkillForClaude(fs.readFileSync(src, 'utf8'), ctx);
    fs.writeFileSync(path.join(destDir, 'SKILL.md'), transformed);
  }

  // Agents: copy verbatim (no cross-ref rewrites needed).
  for (const name of SHIPPED_AGENTS) {
    const agentSrc = path.join(PKG_ROOT, 'agents', `${name}.md`);
    if (fs.existsSync(agentSrc)) {
      fs.copyFileSync(agentSrc, path.join(agentsDir, `${name}.md`));
    }
  }

  // MCP: merge into user or project config.
  mcpMerge(mcpPath);

  // Metadata: VERSION file and bundled CHANGELOG for /kubit-update.
  writeVersionFile(metaDir, version);
  writeChangelogFile(metaDir);

  log(`[claude-code] installed ${skillNames.length} skill(s). Restart Claude Code, then try /kubit-help`);
}

function uninstallClaude(args) {
  const skillsDir = claudeSkillsDir(args);
  const agentsDir = claudeAgentsDir(args);
  const mcpPath = claudeMcpPath(args);
  const metaDir = path.join(claudeBase(args), 'kubit');

  let removed = 0;
  if (fs.existsSync(skillsDir)) {
    for (const f of fs.readdirSync(skillsDir)) {
      if (f.startsWith('kubit-')) {
        rmIfExists(path.join(skillsDir, f));
        removed++;
      }
    }
  }
  removeAllKubitAgents(agentsDir);
  rmIfExists(metaDir);
  mcpRemoveKubit(mcpPath);
  log(`[claude-code] removed ${removed} skill(s), agent, metadata, and mcpServers.kubit entry`);
}

// ---------- runtime: Cursor ----------

function cursorBase(args) {
  if (args.local) return path.resolve(process.cwd(), '.cursor');
  return path.join(os.homedir(), '.cursor');
}

function cursorSkillsDir(args) {
  return path.join(cursorBase(args), 'skills');
}

function cursorAgentsDir(args) {
  return path.join(cursorBase(args), 'agents');
}

function cursorMcpPath(args) {
  return path.join(cursorBase(args), 'mcp.json');
}

// Rewrite a Claude Code SKILL.md for Cursor's native skills discovery path
// (~/.cursor/skills/<name>/SKILL.md — see cursor.com/docs/plugins). Cursor
// only honors {name, description} in skill frontmatter; strip the rest.
function transformSkillForCursor(skillName, skillMd, ctx) {
  const { frontmatter, body } = parseFrontmatter(skillMd);
  const fm = frontmatter || {};
  const desc = fm.description || `Kubit ${skillName} skill`;
  const newFm = { name: fm.name || skillName, description: desc };
  const newBody = substituteKubitMarkers(body, ctx);
  return writeFrontmatter(newFm, newBody);
}

// Rewrite a Claude Code agent file for Cursor's subagent slot
// (~/.cursor/agents/<name>.md — see cursor.com/docs/subagents).
// Cursor subagents accept { name, description, model?, readonly?, is_background? }.
// Claude-specific `tools:` and `model: sonnet` have no Cursor analog, so strip
// them and let the subagent inherit its parent agent's model + tool access.
function transformAgentForCursor(agentMd) {
  const { frontmatter, body } = parseFrontmatter(agentMd);
  const fm = frontmatter || {};
  const desc = (fm.description || '').replace(/\s+/g, ' ').trim();
  if (!fm.name) fatal(`agent file missing 'name' frontmatter field`);
  const newFm = { name: fm.name, description: desc };
  return writeFrontmatter(newFm, body);
}

async function installCursor(args) {
  const configBase = cursorBase(args);
  const skillsDir = cursorSkillsDir(args);
  const agentsDir = cursorAgentsDir(args);
  const mcpPath = cursorMcpPath(args);
  const metaDir = path.join(configBase, 'kubit');
  const version = readManifestVersion();

  assertSafeConfigDir(configBase);

  log(`\n[cursor] version: ${version}`);
  log(`[cursor] skills:  ${skillsDir}`);
  log(`[cursor] agents:  ${agentsDir}`);
  log(`[cursor] mcp:     ${mcpPath}`);

  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  const srcSkillsDir = path.join(PKG_ROOT, 'skills');
  const skillNames = SHIPPED_SKILLS.filter((n) =>
    fs.existsSync(path.join(srcSkillsDir, n, 'SKILL.md'))
  );

  // Clean install: remove every `kubit-*` skill dir and agent file. This
  // reserves the `kubit-*` namespace for the plugin and — importantly —
  // prunes renamed/dropped entries from prior versions (e.g. kubit-instrument
  // → kubit-integrate) instead of leaving orphans behind.
  pruneStaleInstalls(skillsDir, agentsDir, skillNames, SHIPPED_AGENTS);
  for (const name of skillNames) {
    rmIfExists(path.join(skillsDir, name));
  }
  for (const name of SHIPPED_AGENTS) {
    rmIfExists(path.join(agentsDir, `${name}.md`));
  }
  rmIfExists(metaDir);

  const ctx = {
    runtime: 'cursor',
    configDir: configBase,
    scope: args.local ? 'local' : 'global',
    otelEndpoint: KUBIT_OTEL_ENDPOINT,
  };

  for (const name of skillNames) {
    const srcDir = path.join(srcSkillsDir, name);
    const src = path.join(srcDir, 'SKILL.md');
    if (!fs.existsSync(src)) continue;
    const destDir = path.join(skillsDir, name);
    fs.mkdirSync(destDir, { recursive: true });
    // Copy every sibling file/dir next to SKILL.md (e.g. references/). Markdown
    // files get marker substitution; other files are byte-for-byte.
    for (const entry of fs.readdirSync(srcDir)) {
      if (entry === 'SKILL.md') continue;
      copySkillSibling(path.join(srcDir, entry), path.join(destDir, entry), ctx);
    }
    // SKILL.md gets frontmatter normalized for Cursor + marker substitution.
    const transformed = transformSkillForCursor(name, fs.readFileSync(src, 'utf8'), ctx);
    fs.writeFileSync(path.join(destDir, 'SKILL.md'), transformed);
  }

  // Agents: install each allowlisted agent as a Cursor subagent.
  let agentsInstalled = 0;
  for (const name of SHIPPED_AGENTS) {
    const agentSrc = path.join(PKG_ROOT, 'agents', `${name}.md`);
    if (fs.existsSync(agentSrc)) {
      const transformed = transformAgentForCursor(fs.readFileSync(agentSrc, 'utf8'));
      fs.writeFileSync(path.join(agentsDir, `${name}.md`), transformed);
      agentsInstalled++;
    }
  }

  // MCP: merge into ~/.cursor/mcp.json
  mcpMerge(mcpPath);

  // Metadata: VERSION file and bundled CHANGELOG for /kubit-update.
  writeVersionFile(metaDir, version);
  writeChangelogFile(metaDir);

  log(`[cursor] installed ${skillNames.length} skill(s) + ${agentsInstalled} subagent(s). Restart Cursor, then try /kubit-help`);
}

function uninstallCursor(args) {
  const skillsDir = cursorSkillsDir(args);
  const agentsDir = cursorAgentsDir(args);
  const mcpPath = cursorMcpPath(args);
  const metaDir = path.join(cursorBase(args), 'kubit');

  let removed = 0;
  if (fs.existsSync(skillsDir)) {
    for (const f of fs.readdirSync(skillsDir)) {
      if (f.startsWith('kubit-')) {
        rmIfExists(path.join(skillsDir, f));
        removed++;
      }
    }
  }
  removeAllKubitAgents(agentsDir);
  rmIfExists(metaDir);
  mcpRemoveKubit(mcpPath);
  log(`[cursor] removed ${removed} skill(s), subagent, metadata, and mcpServers.kubit entry`);
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(HELP); return; }

  const mode = args.uninstall ? 'uninstall' : 'install';

  // Runtime: --runtime flag skips the prompt; otherwise ask interactively.
  let runtimes;
  if (args.runtime) {
    runtimes = args.runtime === 'both' ? ['claude', 'cursor'] : [args.runtime];
  } else {
    const runtimeIdx = await promptChoice(`Which runtime(s) to ${mode}?`, [
      'Claude Code',
      'Cursor',
      'Both',
    ], 0);
    runtimes = [['claude'], ['cursor'], ['claude', 'cursor']][runtimeIdx];
  }

  // Resolve location
  if (!args.global && !args.local) {
    if (args.yes) args.global = true;
    else {
      const verb = mode === 'uninstall' ? 'Uninstall from' : 'Install to';
      const idx = await promptChoice(`${verb} global (user-wide) or local (current directory)?`, [
        'Global',
        'Local',
      ], 0);
      args.global = idx === 0;
      args.local = idx === 1;
    }
  }

  log(`\nkubit-agent-plugin — ${mode} (${args.local ? 'local' : 'global'}) for: ${runtimes.join(', ')}`);

  for (const rt of runtimes) {
    if (rt === 'claude') {
      if (mode === 'install') await installClaude(args);
      else uninstallClaude(args);
    } else if (rt === 'cursor') {
      if (mode === 'install') await installCursor(args);
      else uninstallCursor(args);
    }
  }

  log('\ndone.');
}

if (require.main === module) {
  main().catch((err) => fatal(err.stack || err.message || String(err)));
}

module.exports = { substituteKubitMarkers, copySkillSibling, PROD_FLAVOR, resolveFlavor };
