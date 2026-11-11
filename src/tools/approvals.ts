import { c } from '../util/colors.js';
import { indent } from '../util/text.js';

export type ApprovalMode = 'ask' | 'yes' | 'no';

export type AskFn = (question: string) => Promise<string>;

/**
 * Decides whether a potentially destructive action may run.
 *
 * - `ask` prompts the user on a TTY (with a session-wide "always" option).
 * - `yes` auto-approves everything (for scripts).
 * - `no` refuses everything (for non-interactive runs without --yes).
 */
export class Approvals {
  private readonly always = new Set<string>();

  constructor(
    private readonly mode: ApprovalMode,
    private readonly ask?: AskFn,
  ) {}

  async request(kind: string, title: string, detail: string): Promise<boolean> {
    if (this.mode === 'yes') return true;
    if (this.mode === 'no' || !this.ask) {
      process.stderr.write(
        `${c.yellow('!')} Blocked ${kind}: ${title} ${c.dim('(non-interactive; pass --yes to allow)')}\n`,
      );
      return false;
    }
    if (this.always.has(kind)) return true;

    const body = indent(detail, '    ');
    process.stdout.write(`\n${c.yellow('⚠')} ${c.bold(title)}\n${body}\n`);
    const answer = (await this.ask(`${c.dim('Allow?')} [${c.bold('y')}]es / [${c.bold('n')}]o / [${c.bold('a')}]lways: `))
      .trim()
      .toLowerCase();

    if (answer === 'a' || answer === 'always') {
      this.always.add(kind);
      return true;
    }
    const allowed = answer === 'y' || answer === 'yes' || answer === '';
    if (!allowed) process.stdout.write(`${c.dim('  skipped')}\n`);
    return allowed;
  }
}
