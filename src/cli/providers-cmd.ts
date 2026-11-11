import { c } from '../util/colors.js';
import { PRESETS, isAvailable } from '../providers/registry.js';
import { truncate } from '../util/text.js';

export function runProvidersCommand(): void {
  const idWidth = Math.max(8, ...PRESETS.map((preset) => preset.id.length));
  const labelWidth = Math.max(8, ...PRESETS.map((preset) => preset.label.length));
  const modelWidth = 40;

  process.stdout.write(`${c.bold('Providers')}\n`);
  process.stdout.write(
    `  ${c.dim('id'.padEnd(idWidth))}  ${c.dim('name'.padEnd(labelWidth))}  ${c.dim('default model'.padEnd(modelWidth))}  ${c.dim('auth')}\n`,
  );

  for (const preset of PRESETS) {
    const available = isAvailable(preset);
    const model = available ? truncate(preset.defaultModel, modelWidth) : '—';
    const auth =
      !available
        ? c.red('not supported')
        : preset.auth === 'none'
          ? c.dim('no key')
          : preset.auth === 'custom'
            ? c.dim('cloud credentials')
            : c.cyan(preset.envKeys[0] ?? 'credentials');
    const marker = preset.experimental ? c.yellow('*') : ' ';
    process.stdout.write(
      `${marker} ${preset.id.padEnd(idWidth)}  ${preset.label.padEnd(labelWidth)}  ${model.padEnd(modelWidth)}  ${auth}\n`,
    );
  }

  const unsupported = PRESETS.filter((preset) => !isAvailable(preset));
  const experimental = PRESETS.filter((preset) => preset.experimental);

  if (experimental.length > 0) {
    process.stdout.write(`\n${c.yellow('*')} ${c.dim('experimental — may rely on a non-public API')}\n`);
    for (const preset of experimental) {
      process.stdout.write(`  ${c.dim(`${preset.id}: ${preset.notes ?? ''}`)}\n`);
    }
  }

  if (unsupported.length > 0) {
    process.stdout.write(`\n${c.dim('Not supported yet:')}\n`);
    for (const preset of unsupported) {
      process.stdout.write(`  ${c.dim(`${preset.id.padEnd(10)} ${preset.notes ?? ''}`)}\n`);
    }
  }

  process.stdout.write(
    `\n${c.dim('Log in with')} parallax login --provider <id>  ${c.dim('or set the env var shown above.')}\n`,
  );
  process.stdout.write(
    `${c.dim('Any OpenAI-compatible endpoint works too:')} parallax --provider openai --base-url <url> --model <id>\n`,
  );
}
