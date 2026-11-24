'use strict';
// Pins what the skills say about orion's MCP server: the interfaces orion removed stay gone, and the
// strings orion returns, which a skill must act on, stay named. Each orion string cites where orion writes it.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { substituteKubitMarkers } = require('../bin/install.js');

const root = path.join(__dirname, '..');
const ctx = { runtime: 'claude', configDir: '/tmp/cfg', scope: 'global' };
// Skills are read as installed, with the shared text (sign-in) inlined.
const read = (file) => substituteKubitMarkers(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
// Line wrapping must not decide a check: compare with runs of whitespace collapsed.
const flat = (text) => text.replace(/\s+/g, ' ');

const failures = [];
const mustSay = (file, text) => {
  if (!flat(read(file)).includes(flat(text))) failures.push(`${file} should say: ${text}`);
};
const mustNotSay = (file, text) => {
  if (flat(read(file)).includes(flat(text))) failures.push(`${file} should not say: ${text}`);
};

const REPORT = 'skills/kubit-report/SKILL.md';
const INSPECT = 'skills/kubit-inspect/SKILL.md';
const CONNECT = 'skills/kubit-connect/SKILL.md';
const INTEGRATE = 'skills/kubit-integrate/SKILL.md';
const BLAME = 'skills/kubit-blame/SKILL.md';

// Interfaces orion removed (orion 89adfa67) and sign-in text Claude Code no longer matches.
mustNotSay(INSPECT, 'directly to `inspect`');
mustNotSay(REPORT, 'create_report(query=');
mustNotSay(REPORT, 'Reports are immutable');
mustNotSay(REPORT, 'never ask the user to paste the callback');
mustNotSay(REPORT, 'the error surfaces an auth URL');
for (const file of [BLAME, INTEGRATE]) mustNotSay(file, '#kubit');

// /kubit-report names orion's loop; orion's tool descriptions and results carry the rules.
mustSay(REPORT, 'get_report_instructions');
mustSay(REPORT, 'get_analytics_schema');
mustSay(REPORT, 'create_report(kind=');
mustSay(REPORT, 'basedOnReportId');
mustSay(REPORT, 'The report was not run'); // orion src/agent/create-report/direct.ts
mustSay(REPORT, 'investigate_agent_flow_failure');
mustSay(REPORT, 'Do NOT use for inspecting individual records');
mustNotSay(REPORT, 'Flow, and Retention');
mustNotSay('skills/kubit-help/SKILL.md', 'Flows, and Retention');

// /kubit-inspect builds rows and cohort subjects with create_report.
mustSay(INSPECT, 'create_report(kind=');
mustSay(INSPECT, '`inspection`');
mustSay(INSPECT, 'capped by the warehouse'); // orion src/reports/render.ts
mustNotSay(INSPECT, 'Entity-type clarification');
mustNotSay(INSPECT, 'Traces: short id, status, cost, latency');

// orion offers one row kind, activity, on every workspace: no skill says grid.
const markdown = (dir) => fs.readdirSync(path.join(root, dir), { recursive: true }).filter((f) => f.endsWith('.md')).map((f) => path.join(dir, f));
for (const file of [...markdown('skills'), ...markdown('agents')]) {
  if (/\bgrids?\b/i.test(read(file))) failures.push(`${file} should not say grid`);
}

// orion src/mcp-tools/context-freshness.ts appends this to a result when memory, instructions or skills changed.
for (const file of [REPORT, INSPECT, CONNECT]) mustSay(file, 'Lumos context changed since it was loaded');

// Sign-in, as inlined into every skill: Claude Code's own authenticate tools first, /mcp when they are absent.
for (const text of [
  'mcp__kubit-agent__authenticate',
  'complete_authentication',
  'callback_url',
  'run `/mcp`',
  'claude mcp login kubit-agent --no-browser',
  'Cursor Settings',
]) mustSay(REPORT, text);
mustSay(CONNECT, 'Kubit tools are not available');

// /kubit-integrate: workspace_create already mints the key; a partial failure leaves a workspace and no key.
mustSay(INTEGRATE, 'A response starting `Workspace created (`'); // orion src/mcp-tools/workspace-create/register.ts
mustSay(INTEGRATE, 'do not call `workspace_mint_key`');
mustNotSay(INTEGRATE, 'switch { orgId, workspaceId, wsctx }');
mustNotSay(INTEGRATE, 'or the one returned by `workspace_create` for `created`');

// Missing Kubit tools (only `authenticate` offered) go to the shared sign-in block.
for (const file of [REPORT, INSPECT, 'skills/kubit-help/SKILL.md']) mustSay(file, 'On an auth error or missing Kubit tools');
mustNotSay(CONNECT, 'surfaced auth URL');
mustNotSay(CONNECT, 'opening an auth URL the MCP surfaces');
// switch returns a new wsctx; the old one keeps the stale markers.
for (const file of [REPORT, INSPECT, CONNECT]) mustSay(file, 'use the wsctx it returns');
mustSay(REPORT, '**Change**');
mustSay(INSPECT, 'totalRows: 0'); // orion src/reports/render.ts
mustNotSay(INSPECT, 'Zero results and errors return short text');
mustNotSay(INSPECT, 'top errors, session count, top intent');
mustSay(INSPECT, 'search_published_cohorts');
mustNotSay('skills/kubit-help/SKILL.md', 'Returns up to 5 results by default');

// Decision 20: everything orion offers is in 0.2.0.
const HELP = 'skills/kubit-help/SKILL.md';
mustSay(REPORT, 'inspect_agent_flow_activity');
mustSay(REPORT, 'rows={offset');
mustSay(INSPECT, 'rows={offset');
for (const file of [REPORT, INSPECT, CONNECT]) mustSay(file, '<lumos-instructions>');
mustSay(INSPECT, '<memory-context>');
mustSay(REPORT, 'memory(action="update"');
mustSay(REPORT, 'git history');
for (const file of [CONNECT, INTEGRATE]) mustSay(file, '[modeled:');
for (const tool of ['import_dashboard', 'publish_component', 'explain_field', '`memory`', '`skill`']) mustSay(HELP, tool);
mustSay(HELP, 'already filed in this conversation');
mustSay(HELP, 'No secrets');
// A BUG or QUESTION ticket carries the project's stack, read from its manifest, not from memory; never internal names.
mustSay(HELP, 'Before the preview of a ticket, read the project');
mustSay(HELP, 'never internal package names');
mustSay(HELP, 'If the files cannot be read, leave the project lines out');
for (const tool of ['explain_field', 'import_dashboard']) mustSay('skills/kubit/SKILL.md', tool);
for (const file of [INTEGRATE, CONNECT]) mustSay(file, 'requestType: BUG');
mustSay('skills/kubit-update/SKILL.md', 'kubit-blame-mapper');
mustNotSay('agents/kubit-analyst.md', 'required analysis path');
mustNotSay('README.md', 'always prompted');
mustSay(REPORT, 'get_report(reportId=<id>, wsctx)');
// The first 20 rows and series totals come with the result: the analyst is for what they cannot answer.
mustNotSay(REPORT, 'required whenever an export URL is available');

// /kubit-update prints from the newest release header down to the installed one, skipping [Unreleased].
for (const header of ['## [0.2.0]', '## [0.1.6] - 2026-08-20', '## [0.1.5] - 2026-07-29']) mustSay('CHANGELOG.md', header);

// Review fixes: each states what orion does.
// orion src/mcp-tools/workspace-create/register.ts — no MCP tool re-runs a failed warehouse init.
mustSay(INTEGRATE, 'but warehouse init failed');
mustSay(INTEGRATE, 'do not mint a key or instrument');
// /kubit calls no Kubit tool itself: the two tool rows hand off after /kubit-connect.
mustNotSay('skills/kubit/SKILL.md', '(no skill)');
mustSay('skills/kubit/SKILL.md', 'ask in your own words after /kubit-connect');
// orion QUESTION_RULE (src/agent/support/submit-support-request.ts).
mustSay(HELP, 'or when the user asks for the Kubit team');
// orion agent-flow tools take reportId as a string (src/mcp-tools/agent-flow/register.ts).
mustSay(REPORT, 'reportId="<id>"');
// authenticate is Claude Code's tool for a signed-out server, not the server's own.
mustNotSay(CONNECT, "the server's `authenticate` tool");
mustNotSay('CHANGELOG.md', "sign-in page's address");

// pr-review fixes. Titan's term for trace rows is the OTEL Activity profile (titan activity.graphqls:167).
mustSay(INSPECT, 'OTEL Activity profile');
for (const file of [REPORT, INSPECT]) {
  mustNotSay(file, 'no MCP fallback');
  mustNotSay(file, 'report JSON');
  mustNotSay(file, 'subjects of a cohort');
}
// Shared rules are written once in bin/install.js and inlined at install.
for (const file of [REPORT, INSPECT, CONNECT]) {
  if (!fs.readFileSync(path.join(root, file), 'utf8').includes('{{KUBIT_LUMOS_CONTEXT}}')) failures.push(`${file} should use {{KUBIT_LUMOS_CONTEXT}}`);
}
for (const file of [CONNECT, INTEGRATE]) {
  if (!fs.readFileSync(path.join(root, file), 'utf8').includes('{{KUBIT_BUG_TICKET}}')) failures.push(`${file} should use {{KUBIT_BUG_TICKET}}`);
}

// orion's help text asks for the report page links; an MCP client's chat is not in Kubit.
mustSay(HELP, 'the Kubit report page link of each report the issue is about');

// orion src/reports/get-report/rows.ts: an Activity report is paged, never filtered by where/columns.
mustNotSay(INSPECT, 'where={');
mustSay(INSPECT, 'An Activity report is paged, not filtered');
mustSay(REPORT, 'An Activity report is paged, not filtered');
// A failure without the "Workspace created (" text may still have left a workspace on an older orion.
mustSay(INTEGRATE, 'check the workspace list with `/kubit-connect` before creating it again');

// Every marker is substituted at install; {{KUBIT_IMPORT_STATEMENT}} is filled when the code is written.
for (const file of markdown('skills')) {
  const left = read(file).match(/\{\{KUBIT_(?!IMPORT_STATEMENT\b)\w+\}\}/g);
  if (left) failures.push(`${file} keeps unsubstituted ${left.join(', ')}`);
}
mustNotSay('CHANGELOG.md', '`/kubit-blame` name the date');
mustSay(INSPECT, '"users except those who…") → `activity`');
mustSay(CONNECT, 'call `init` only when none is known');

// Claude Code shows only the highlighted option's preview: the ticket must be on each one.
mustSay(HELP, 'as the `preview` of every option');

if (failures.length > 0) {
  console.error(failures.map((f) => `not ok - ${f}`).join('\n'));
  assert.fail(`${failures.length} skills contract check(s) failed`);
}
console.log('ok - skills contract');
