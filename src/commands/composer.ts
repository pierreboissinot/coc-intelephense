import { commands, ExtensionContext, Terminal, window, workspace } from 'coc.nvim';

import cp from 'child_process';
import fs from 'fs';
import path from 'path';

let terminal: Terminal | undefined;

export function activate(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand('intelephense.composer.runCommand', runComposerCommandCommand()),
    commands.registerCommand('intelephense.composer.runCommandPlus', runComposerCommandPlusCommand()),
    commands.registerCommand('intelephense.composer.runScriptsCommand', runComposerScriptsCommand())
  );
}

async function getComposerPath() {
  let cmdPath = '';
  const composerPath = workspace.getConfiguration('intelephense').get<string>('composer.path', 'composer');
  if (await existsComposer(composerPath)) {
    cmdPath = composerPath;
  }
  return cmdPath;
}

async function existsComposer(composerPath: string) {
  return new Promise<boolean>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cp.exec(`${composerPath} --version`, (err, stdout, stderr) => {
      if (stdout.length > 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

function existsComposerJson() {
  let exists = false;
  const composerJsonPath = path.join(workspace.root, 'composer.json');
  if (fs.existsSync(composerJsonPath)) {
    exists = true;
  }
  return exists;
}

async function runComposer(composerPath: string, args: string[]) {
  if (!composerPath) {
    window.showErrorMessage(`composer command not found!`);
    return;
  }

  if (terminal) {
    if (terminal.bufnr) {
      await workspace.nvim.command(`bd! ${terminal.bufnr}`);
    }
    terminal.dispose();
    terminal = undefined;
  }

  terminal = await window.createTerminal({ name: 'composer', cwd: workspace.root });
  terminal.sendText(`${composerPath} ${args.join(' ')}`);

  const enableSplitRight = workspace.getConfiguration('intelephense').get('composer.enableSplitRight', false);

  if (enableSplitRight) terminal.hide();
  await workspace.nvim.command('stopinsert');
  if (enableSplitRight) {
    await workspace.nvim.command(`vert bel sb ${terminal.bufnr}`);
    await workspace.nvim.command(`wincmd p`);
  }
}

export function runComposerCommandCommand() {
  return async () => {
    const composerPath = await getComposerPath();
    const args: string[] = [];

    const runCommandList = workspace.getConfiguration('intelephense').get<string[]>('composer.runCommandList', []);

    if (runCommandList.length === 0) {
      window.showErrorMessage(`runCommandList is empty`);
      return;
    }

    // Index of selected item, or -1 when canceled.
    const choiceNumber = await window.showQuickpick(runCommandList);

    if (choiceNumber !== -1) {
      args.push(runCommandList[choiceNumber]);
      runComposer(composerPath, args);
    }
  };
}

export function runComposerCommandPlusCommand() {
  return async () => {
    const composerPath = await getComposerPath();
    const args: string[] = [];

    const runCommandPlusList = workspace
      .getConfiguration('intelephense')
      .get<string[]>('composer.runCommandPlusList', []);

    if (runCommandPlusList.length === 0) {
      window.showErrorMessage(`runCommandPlusList is empty`);
      return;
    }

    // Index of selected item, or -1 when canceled.
    const choiceNumber = await window.showQuickpick(runCommandPlusList);

    if (choiceNumber !== -1) {
      const input = await window.requestInput(`composer ${runCommandPlusList[choiceNumber]}`);

      if (input) {
        args.push(runCommandPlusList[choiceNumber]);
        args.push(input);

        runComposer(composerPath, args);
      }
    }
  };
}

export function runComposerScriptsCommand() {
  return async () => {
    const composerPath = await getComposerPath();
    const args: string[] = [];

    if (!existsComposerJson()) {
      window.showErrorMessage(`composer.json not found!`);
      return;
    }

    const composerJson = JSON.parse(fs.readFileSync(path.join(workspace.root, 'composer.json'), 'utf8'));

    const scriptsList: string[] = [];

    Object.keys(composerJson).map((key) => {
      if (key === 'scripts') {
        const scriptsObj = composerJson[key];
        Object.keys(scriptsObj).map((key) => {
          if (!key.startsWith('pre-') && !key.startsWith('post-')) {
            scriptsList.push(key);
          }
        });
      }
    });

    if (scriptsList.length >= 1) {
      // Index of selected item, or -1 when canceled.
      const choiceNumber = await window.showQuickpick(scriptsList);

      if (choiceNumber !== -1) {
        args.push('run-script');
        args.push(scriptsList[choiceNumber]);

        runComposer(composerPath, args);
      }
    } else {
      window.showWarningMessage(`scripts not found. events (pre-, post-) are excluded by default`);
      return;
    }
  };
}
