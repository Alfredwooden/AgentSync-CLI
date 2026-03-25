import pc from 'picocolors';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

const MAX_VISIBLE = 12;

export async function searchableMultiselect(opts: {
  message: string;
  options: SelectOption[];
}): Promise<string[] | null> {
  const { message, options } = opts;

  return new Promise(resolve => {
    const selected = new Set<string>();
    let query = '';
    let cursor = 0;
    let scrollOffset = 0;
    let renderedLines = 0;

    const { stdout, stdin } = process;

    function getFiltered(): SelectOption[] {
      if (!query) return options;
      const q = query.toLowerCase();
      return options.filter(
        o =>
          o.label.toLowerCase().includes(q) ||
          (o.hint?.toLowerCase().includes(q) ?? false)
      );
    }

    function truncate(str: string, max: number) {
      // strip ansi for length calc
      const plain = str.replace(/\x1b\[[0-9;]*m/g, '');
      if (plain.length <= max) return str;
      // crude truncate — cut raw string proportionally
      return str.slice(0, Math.floor(str.length * (max / plain.length) - 1)) + '…';
    }

    function render(filtered: SelectOption[]) {
      const cols = stdout.columns ?? 100;

      // Clear previous render
      if (renderedLines > 0) {
        stdout.write(`\x1b[${renderedLines}A\x1b[J`);
      }

      const lines: string[] = [];

      // Header + search bar
      lines.push(`${pc.cyan('◆')} ${pc.bold(message)}`);
      lines.push(
        `${pc.dim('│')} ${pc.cyan('/')} ${query}${pc.inverse(' ')}  ` +
          pc.dim(`${filtered.length}/${options.length} skills`)
      );
      lines.push(pc.dim('│'));

      // Clamp cursor & scroll
      if (cursor >= filtered.length) cursor = Math.max(0, filtered.length - 1);
      if (cursor < scrollOffset) scrollOffset = cursor;
      if (cursor >= scrollOffset + MAX_VISIBLE) scrollOffset = cursor - MAX_VISIBLE + 1;

      if (filtered.length === 0) {
        lines.push(`${pc.dim('│')}  ${pc.yellow('No matches')}`);
      } else {
        if (scrollOffset > 0) {
          lines.push(`${pc.dim('│')}  ${pc.dim(`↑ ${scrollOffset} more above`)}`);
        }

        const visible = filtered.slice(scrollOffset, scrollOffset + MAX_VISIBLE);
        for (let i = 0; i < visible.length; i++) {
          const opt = visible[i];
          const idx = scrollOffset + i;
          const isActive = idx === cursor;
          const isSelected = selected.has(opt.value);

          const checkbox = isSelected ? pc.green('●') : pc.dim('○');
          const pointer = isActive ? pc.cyan('›') : ' ';
          const label = isActive ? pc.cyan(pc.bold(opt.label)) : opt.label;
          const hint = opt.hint ? pc.dim(`  ${opt.hint}`) : '';
          lines.push(truncate(`${pc.dim('│')} ${pointer} ${checkbox} ${label}${hint}`, cols));
        }

        const remaining = filtered.length - scrollOffset - MAX_VISIBLE;
        if (remaining > 0) {
          lines.push(`${pc.dim('│')}  ${pc.dim(`↓ ${remaining} more below`)}`);
        }
      }

      lines.push(pc.dim('│'));
      const countHint = selected.size > 0 ? pc.green(`${selected.size} selected  `) : '';
      lines.push(
        `${pc.dim('└')} ${countHint}${pc.dim('↑↓ navigate   space toggle   enter confirm   esc cancel')}`
      );

      stdout.write(lines.join('\n') + '\n');
      renderedLines = lines.length;
    }

    function cleanup() {
      stdout.write('\x1b[?25h'); // show cursor
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeAllListeners('data');
    }

    stdout.write('\x1b[?25l'); // hide cursor
    let filtered = getFiltered();
    render(filtered);

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    stdin.on('data', (key: string) => {
      if (key === '\x03') { // Ctrl+C
        cleanup();
        process.exit(0);
      }

      if (key === '\x1b') { // Escape (lone — not part of sequence)
        cleanup();
        resolve(null);
        return;
      }

      if (key === '\r' || key === '\n') { // Enter
        cleanup();
        resolve(Array.from(selected));
        return;
      }

      if (key === '\x7f' || key === '\x08') { // Backspace
        if (query.length > 0) {
          query = query.slice(0, -1);
          cursor = 0;
          scrollOffset = 0;
          filtered = getFiltered();
          render(filtered);
        }
        return;
      }

      if (key === ' ') { // Space — toggle
        const opt = filtered[cursor];
        if (opt) {
          if (selected.has(opt.value)) selected.delete(opt.value);
          else selected.add(opt.value);
          render(filtered);
        }
        return;
      }

      if (key === '\x1b[A') { // Up arrow
        if (cursor > 0) { cursor--; render(filtered); }
        return;
      }

      if (key === '\x1b[B') { // Down arrow
        if (cursor < filtered.length - 1) { cursor++; render(filtered); }
        return;
      }

      // Printable character → update search
      if (key.length === 1 && key >= ' ') {
        query += key;
        cursor = 0;
        scrollOffset = 0;
        filtered = getFiltered();
        render(filtered);
      }
    });
  });
}
