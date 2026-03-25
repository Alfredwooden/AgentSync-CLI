#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { pullCommand } from './commands/pull';
import { linkCommand } from './commands/link';
import { unlinkCommand } from './commands/unlink';
import { doctorCommand } from './commands/doctor';
import { createCommand } from './commands/create';
import { scanCommand } from './commands/scan';

const program = new Command();

program
  .name('agentsync')
  .description('Unified Skill and Instruction management for AI coding assistants')
  .version('0.1.0');

program
  .command('create')
  .description('Create a new skill locally or pull one from VoltAgents')
  .action(createCommand);

program
  .command('scan')
  .description('Scan project directories for unmanaged skills and decide what to do with them')
  .option('-d, --dir <path>', 'Extra directory to scan (can be repeated)', (v, acc: string[]) => [...acc, v], [] as string[])
  .action((opts: { dir: string[] }) => scanCommand(opts));

program
  .command('init')
  .description('Initialize AgentSync in the current project')
  .action(initCommand);

program
  .command('pull')
  .description('Browse and download skills from VoltAgent/awesome-agent-skills')
  .action(pullCommand);

program
  .command('link')
  .description('Create symlinks for a profile in the current project')
  .requiredOption('-p, --profile <name>', 'Profile name to link')
  .action((opts: { profile: string }) => linkCommand(opts.profile));

program
  .command('unlink')
  .description('Remove AgentSync symlinks from the current project')
  .option('-p, --profile <name>', 'Profile name to unlink (omit to unlink all)')
  .action((opts: { profile?: string }) => unlinkCommand(opts.profile));

program
  .command('doctor')
  .description('Check for broken symlinks and configuration issues')
  .action(doctorCommand);

program.parse();
