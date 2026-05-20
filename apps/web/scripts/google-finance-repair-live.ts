import Module from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type CliOptions = {
  confirm: boolean;
  dryRun: boolean;
  wait: boolean;
};

type RepairModule = typeof import('../lib/server/googleSheetsRepair');

const CLI_COMMAND = 'npm run google-finance-repair --workspace=apps/web -- --confirm --wait';

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function loadGoogleFinanceRepairLocalEnv(cwd = process.cwd()): void {
  const candidates = [join(cwd, '.env.local'), join(cwd, 'apps', 'web', '.env.local')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || line.trimStart().startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      if (!key || process.env[key]) continue;
      process.env[key] = unquoteEnvValue(line.slice(idx + 1));
    }
    return;
  }
}

function installServerOnlyShim(): void {
  const moduleWithLoad = Module as unknown as {
    _load: (request: string, parent?: unknown, isMain?: boolean) => unknown;
  };
  const originalLoad = moduleWithLoad._load;
  moduleWithLoad._load = function patchedLoad(request: string, parent?: unknown, isMain?: boolean) {
    if (request === 'server-only') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
}

export function parseGoogleFinanceRepairArgs(argv: string[]): CliOptions {
  const confirm = argv.includes('--confirm');
  const explicitDryRun = argv.includes('--dry-run');
  return {
    confirm,
    dryRun: explicitDryRun || !confirm,
    wait: argv.includes('--wait'),
  };
}

function line(label: string, value: unknown): string {
  return `${label}: ${String(value ?? 'unknown')}`;
}

export async function runGoogleFinanceRepairCli(
  argv = process.argv.slice(2),
  io: { write: (text: string) => void } = { write: (text) => process.stdout.write(text) },
): Promise<number> {
  const options = parseGoogleFinanceRepairArgs(argv);
  loadGoogleFinanceRepairLocalEnv();
  installServerOnlyShim();
  const repair = (await import('../lib/server/googleSheetsRepair')) as RepairModule;
  const result = await repair.runGoogleSheetsRepairCore({
    confirm: options.confirm,
    dryRun: options.dryRun,
    wait: options.wait,
    overwrite: false,
  });
  const plan = result.repairPlan;
  const post = result.postCheck;
  const operations = result.appliedOperations.length > 0 ? result.appliedOperations.join(', ') : '(none)';
  const appended = result.appendedAnchorSymbols?.length ? result.appendedAnchorSymbols.join(', ') : '(none)';
  const plannedOperations = (plan?.operations ?? [])
    .filter((op) => op.type !== 'no_op')
    .map((op) => `${op.operationId}:${op.riskLevel}${op.blockedReason ? `:${op.blockedReason}` : ''}`)
    .join(', ') || '(none)';
  const portfolioQuotesStatus =
    post?.parsedRowsOk != null
      ? post.parsedRowsOk > 0 || (post.anchorMatched ?? 0) > 0
        ? 'found'
        : 'missing_or_empty'
      : plan?.status === 'write_not_available'
        ? 'not_configured'
        : 'unknown';

  io.write(
    [
      '[Google Finance Repair]',
      line('mode', options.confirm ? 'confirm' : 'dry-run'),
      line('serviceAccount', plan?.credential.serviceAccountEmailMasked ?? 'not_configured'),
      line('repairPlan', plan?.status ?? result.status),
      line('planned operations', plannedOperations),
      line('portfolio_quotes', portfolioQuotesStatus),
      line('operations applied', operations),
      line('appended anchors', appended),
      'postCheck:',
      `  parsedRowsOk: ${post?.parsedRowsOk ?? 0}`,
      `  anchorMatched: ${post?.anchorMatched ?? 0}`,
      `  anchorOk: ${post?.anchorOk ?? 0}`,
      `  missingAnchors: ${(post?.missingAnchors ?? []).join(', ') || '(none)'}`,
      `  formulaPendingCount: ${result.formulaPendingCount ?? 0}`,
      'next:',
      `  ${result.recommendedNextAction ?? post?.recommendedNextAction ?? plan?.actionHint ?? '상태 확인이 필요합니다.'}`,
      'copy:',
      `  ${CLI_COMMAND}`,
      '',
    ].join('\n'),
  );

  return result.ok || options.dryRun ? 0 : 1;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/google-finance-repair-live.ts')) {
  runGoogleFinanceRepairCli().then((code) => {
    process.exitCode = code;
  });
}
