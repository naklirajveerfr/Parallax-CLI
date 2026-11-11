const enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

function wrap(open: string, close: string) {
  return (input: string): string => (enabled ? `\x1b[${open}m${input}\x1b[${close}m` : input);
}

export const c = {
  reset: '\x1b[0m',
  enabled,
  bold: wrap('1', '22'),
  dim: wrap('2', '22'),
  italic: wrap('3', '23'),
  underline: wrap('4', '24'),
  red: wrap('31', '39'),
  green: wrap('32', '39'),
  yellow: wrap('33', '39'),
  blue: wrap('34', '39'),
  magenta: wrap('35', '39'),
  cyan: wrap('36', '39'),
  gray: wrap('90', '39'),
  bgRed: wrap('41', '49'),
};

/** Visible length of a string, ignoring ANSI escape sequences. */
export function width(text: string): number {
  return stripAnsi(text).length;
}

/** Remove ANSI escape sequences (colors, cursor moves). */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}
