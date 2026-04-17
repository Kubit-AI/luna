#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const PKG_ROOT = path.resolve(__dirname, '..');

// Explicit allowlist of skills that ship. Source folders under `skills/` not
// listed here stay in the repo but are not installed. Keep this in sync with
// README.md, skills/help/SKILL.md, CHANGELOG.md, and CLAUDE.md.
const SHIPPED_SKILLS = ['connect', 'help', 'inspect', 'report', 'update'];

const HELP = `kubit-agent-plugin — install the Kubit agent plugin into Claude Code and/or Cursor

Usage:
  npx @kubit/agent-plugin [options]

Runtime (pick one or more; prompted if omitted):
  --claude               Install for Claude Code
  --cursor               Install for Cursor
  --all                  Install for both

Location:
  -g, --global           (default) install to user config dir
  -l, --local            install to ./.claude or ./.cursor under cwd

Management:
  -u, --uninstall        Remove installed files for selected runtime(s)
  -y, --yes              Non-interactive; assume defaults
  -c, --config-dir <p>   Override the user config base dir (applies to Claude Code)
  -h, --help             Show this help
`;

// ---------- flag parsing ----------

function parseArgs(argv) {
  const args = {
    claude: false,
    cursor: false,
    all: false,
    global: false,
    local: false,
    uninstall: false,
    yes: false,
    help: false,
    configDir: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--claude': args.claude = true; break;
      case '--cursor': args.cursor = true; break;
      case '--all': args.all = true; break;
      case '-g': case '--global': args.global = true; break;
      case '-l': case '--local': args.local = true; break;
      case '-u': case '--uninstall': args.uninstall = true; break;
      case '-y': case '--yes': args.yes = true; break;
      case '-h': case '--help': args.help = true; break;
      case '-c': case '--config-dir':
        args.configDir = argv[++i];
        if (!args.configDir) fatal(`${a} requires a path argument`);
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
    .replace(/\{\{KUBIT_SCOPE\}\}/g, ctx.scope);
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
  const ours = readJson(path.join(PKG_ROOT, '.mcp.json'));
  const ourEntry = ours.mcpServers && ours.mcpServers.kubit;
  if (!ourEntry) fatal('bundled .mcp.json is missing mcpServers.kubit — package is corrupt');

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

// Rewrite a Claude Code SKILL.md for the dash-namespaced loose-skill install.
function transformSkillForClaude(skillName, skillMd, ctx) {
  const { frontmatter, body } = parseFrontmatter(skillMd);
  const fm = frontmatter || {};
  const newFm = { ...fm, name: `kubit-${skillName}` };
  const newBody = substituteKubitMarkers(body, ctx);
  return writeFrontmatter(newFm, newBody);
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

  // Clean install: wipe only the dirs we're about to install, preserving
  // any user-added `kubit-<foo>` siblings.
  for (const name of skillNames) {
    rmIfExists(path.join(skillsDir, `kubit-${name}`));
  }
  rmIfExists(path.join(agentsDir, 'kubit-analyst.md'));
  rmIfExists(metaDir);

  const ctx = {
    runtime: 'claude',
    configDir: configBase,
    scope: args.local ? 'local' : 'global',
  };

  for (const name of skillNames) {
    const src = path.join(srcSkillsDir, name, 'SKILL.md');
    if (!fs.existsSync(src)) continue;
    const transformed = transformSkillForClaude(name, fs.readFileSync(src, 'utf8'), ctx);
    const destDir = path.join(skillsDir, `kubit-${name}`);
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'SKILL.md'), transformed);
  }

  // Agent: copy verbatim (no cross-ref rewrites needed).
  const agentSrc = path.join(PKG_ROOT, 'agents', 'kubit-analyst.md');
  if (fs.existsSync(agentSrc)) {
    fs.copyFileSync(agentSrc, path.join(agentsDir, 'kubit-analyst.md'));
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
  rmIfExists(path.join(agentsDir, 'kubit-analyst.md'));
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
// (~/.cursor/skills/<name>/SKILL.md — see cursor.com/docs/plugins).
function transformSkillForCursor(skillName, skillMd, ctx) {
  const { frontmatter, body } = parseFrontmatter(skillMd);
  const desc = (frontmatter && frontmatter.description) || `Kubit ${skillName} skill`;
  const newFm = { name: `kubit-${skillName}`, description: desc };
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
  const newFm = { name: fm.name || 'kubit-analyst', description: desc };
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

  // Clean install: wipe only the dirs we're about to install, preserving
  // any user-added `kubit-<foo>` siblings.
  for (const name of skillNames) {
    rmIfExists(path.join(skillsDir, `kubit-${name}`));
  }
  rmIfExists(path.join(agentsDir, 'kubit-analyst.md'));
  rmIfExists(metaDir);

  const ctx = {
    runtime: 'cursor',
    configDir: configBase,
    scope: args.local ? 'local' : 'global',
  };

  for (const name of skillNames) {
    const src = path.join(srcSkillsDir, name, 'SKILL.md');
    if (!fs.existsSync(src)) continue;
    const transformed = transformSkillForCursor(name, fs.readFileSync(src, 'utf8'), ctx);
    const destDir = path.join(skillsDir, `kubit-${name}`);
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'SKILL.md'), transformed);
  }

  // Agent: install kubit-analyst as a Cursor subagent.
  const agentSrc = path.join(PKG_ROOT, 'agents', 'kubit-analyst.md');
  if (fs.existsSync(agentSrc)) {
    const transformed = transformAgentForCursor(fs.readFileSync(agentSrc, 'utf8'));
    fs.writeFileSync(path.join(agentsDir, 'kubit-analyst.md'), transformed);
  }

  // MCP: merge into ~/.cursor/mcp.json
  mcpMerge(mcpPath);

  // Metadata: VERSION file and bundled CHANGELOG for /kubit-update.
  writeVersionFile(metaDir, version);
  writeChangelogFile(metaDir);

  log(`[cursor] installed ${skillNames.length} skill(s) + 1 subagent. Restart Cursor, then try /kubit-help`);
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
  rmIfExists(path.join(agentsDir, 'kubit-analyst.md'));
  rmIfExists(metaDir);
  mcpRemoveKubit(mcpPath);
  log(`[cursor] removed ${removed} skill(s), subagent, metadata, and mcpServers.kubit entry`);
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(HELP); return; }

  // Resolve runtimes
  let runtimes = [];
  if (args.all || (args.claude && args.cursor)) runtimes = ['claude', 'cursor'];
  else if (args.claude) runtimes = ['claude'];
  else if (args.cursor) runtimes = ['cursor'];
  else if (args.yes) runtimes = ['claude']; // non-interactive default
  else {
    const idx = await promptChoice('Which runtime(s) to install?', [
      'Claude Code',
      'Cursor',
      'Both',
    ], 0);
    runtimes = [['claude'], ['cursor'], ['claude', 'cursor']][idx];
  }

  // Resolve location
  if (!args.global && !args.local) {
    if (args.yes) args.global = true;
    else {
      const idx = await promptChoice('Install globally (user-wide) or locally (current directory)?', [
        'Global',
        'Local',
      ], 0);
      args.global = idx === 0;
      args.local = idx === 1;
    }
  }

  const mode = args.uninstall ? 'uninstall' : 'install';
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

main().catch((err) => fatal(err.stack || err.message || String(err)));
