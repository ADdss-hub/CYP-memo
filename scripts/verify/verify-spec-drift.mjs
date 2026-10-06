#!/usr/bin/env node
// verify-spec-drift.mjs
// Strong spec-drift check for CYP-memo.
//
// Reads monitoring/spec-baseline.json and verifies, for every registered spec:
//   1. Each carrying file (carried_by) really exists on disk.
//   2. last_checked date is within max_age_days (default 90).
//   3. Every spec listed in `applicable_specs` has a matching registry entry
//      (a new/applicable spec not yet registered => drift).
//   Additionally, if .cyp-spec-sync exists, each line is treated as an applicable
//   spec name and must also have a registry entry (preserves old marker as data source).
//
// Exit codes:
//   0  all checks pass
//   2  argument / baseline file error (missing file, invalid JSON, bad args)
//   3  drift detected: missing carrying file, stale date, or unregistered applicable spec
//
// Usage:
//   node scripts/verify/verify-spec-drift.mjs [--baseline <path>] [--now YYYY-MM-DD]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const opts = { baseline: null, now: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--baseline') {
      opts.baseline = argv[++i];
    } else if (a === '--now') {
      opts.now = argv[++i];
    } else if (a === '-h' || a === '--help') {
      opts.help = true;
    } else {
      process.stderr.write(`verify-spec-drift: unknown argument '${a}'\n`);
      process.exit(2);
    }
  }
  return opts;
}

function fail2(msg) {
  process.stderr.write(`verify-spec-drift ERROR: ${msg}\n`);
  process.exit(2);
}

function daysSince(dateStr, nowStr) {
  // Parse as UTC midnight to avoid timezone drift in day math.
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return NaN;
  let nowUtc;
  if (nowStr) {
    const n = new Date(`${nowStr}T00:00:00Z`);
    if (Number.isNaN(n.getTime())) return NaN;
    nowUtc = n.getTime();
  } else {
    const n = new Date();
    nowUtc = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  }
  return Math.floor((nowUtc - d.getTime()) / 86400000);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      'Usage: node scripts/verify/verify-spec-drift.mjs [--baseline <path>] [--now YYYY-MM-DD]\n'
    );
    process.exit(0);
  }

  const baselinePath = opts.baseline
    ? path.resolve(opts.baseline)
    : path.join(repoRoot, 'monitoring', 'spec-baseline.json');

  if (!fs.existsSync(baselinePath)) {
    fail2(`baseline file not found: ${baselinePath}`);
  }

  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch (e) {
    fail2(`invalid JSON in baseline: ${e.message}`);
  }

  if (!baseline || !Array.isArray(baseline.specs) || !Array.isArray(baseline.applicable_specs)) {
    fail2('baseline must contain array fields "specs" and "applicable_specs"');
  }

  const maxAge = Number.isFinite(baseline.max_age_days) ? baseline.max_age_days : 90;
  const specs = baseline.specs;
  const applicable = baseline.applicable_specs;
  const registeredNames = new Set(specs.map((s) => s.spec_name));

  const rows = [];
  let problems = 0;

  // Per-spec checks: carrying files exist + date fresh.
  for (const s of specs) {
    const carried = Array.isArray(s.carried_by) ? s.carried_by : (s.local_path ? [s.local_path] : []);
    let status = 'OK';
    let detail = '';

    // Existence check.
    const missing = [];
    for (const rel of carried) {
      const abs = path.join(repoRoot, rel);
      if (!fs.existsSync(abs)) missing.push(rel);
    }
    if (missing.length > 0) {
      status = 'MISSING';
      detail = 'carrying file(s) not found: ' + missing.join(', ');
      problems++;
    }

    // Date check.
    const age = daysSince(s.last_checked, opts.now);
    if (Number.isNaN(age)) {
      if (status === 'OK') {
        status = 'BAD_DATE';
        detail = `unparseable last_checked: '${s.last_checked}'`;
        problems++;
      }
    } else if (age > maxAge) {
      if (status === 'OK') {
        status = 'STALE';
        detail = `last_checked ${age}d ago (> ${maxAge}d)`;
        problems++;
      }
    }

    const locate = carried.join(' ; ') || '(none)';
    rows.push({
      name: s.spec_name,
      status,
      locate,
      age: Number.isNaN(age) ? '-' : String(age),
      detail,
    });
  }

  // Applicability check: every applicable spec must be registered.
  const unregistered = applicable.filter((name) => !registeredNames.has(name));
  for (const name of unregistered) {
    problems++;
    rows.push({
      name,
      status: 'UNREGISTERED',
      locate: '(applicable but no registry entry)',
      age: '-',
      detail: 'applicable spec not registered in baseline -> drift',
    });
  }

  // Legacy marker as additional data source (graceful: absent is fine).
  const marker = path.join(repoRoot, '.cyp-spec-sync');
  if (fs.existsSync(marker)) {
    const lines = fs.readFileSync(marker, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const name of lines) {
      if (!registeredNames.has(name)) {
        problems++;
        rows.push({
          name,
          status: 'UNREGISTERED',
          locate: '(.cyp-spec-sync)',
          age: '-',
          detail: 'spec in .cyp-spec-sync not registered in baseline -> drift',
        });
      }
    }
  }

  // Render table.
  const nameW = Math.max(12, ...rows.map((r) => r.name.length));
  const statusW = Math.max(13, ...rows.map((r) => r.status.length));
  const ageW = Math.max(4, ...rows.map((r) => r.age.length));
  const head = `SPEC`.padEnd(nameW) + '  ' + `STATUS`.padEnd(statusW) + '  ' + `AGE(d)`.padEnd(ageW) + '  ' + `CARRYING LOCATION`;
  const sep = '-'.repeat(head.length);

  process.stdout.write('\n=== CYP spec-drift check ===\n');
  process.stdout.write(head + '\n');
  process.stdout.write(sep + '\n');
  for (const r of rows) {
    process.stdout.write(
      r.name.padEnd(nameW) + '  ' +
      r.status.padEnd(statusW) + '  ' +
      r.age.padEnd(ageW) + '  ' +
      r.locate + '\n'
    );
    if (r.detail) {
      process.stdout.write(''.padEnd(nameW) + '  ' + ''.padEnd(statusW) + '  ' + ''.padEnd(ageW) + '  ' + '  -> ' + r.detail + '\n');
    }
  }
  process.stdout.write(sep + '\n');
  process.stdout.write(`max_age_days=${maxAge}  specs=${specs.length}  applicable=${applicable.length}  problems=${problems}\n`);

  if (problems > 0) {
    process.stdout.write('spec-drift-check FAILED\n');
    process.exit(3);
  }
  process.stdout.write('spec-drift-check OK (all specs aligned)\n');
  process.exit(0);
}

main();
