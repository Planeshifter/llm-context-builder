import * as vscode from 'vscode';
import * as fs from 'fs';

import { FileExplorerProvider } from './file-explorer-provider';
import { FileItem } from './file-item';
import { getFileContent } from './utils';

export async function activate(context: vscode.ExtensionContext) {
  const workspaceRoot =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;

  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const fileExplorerProvider = new FileExplorerProvider(workspaceRoot);
  const treeView = vscode.window.createTreeView('fileExplorer', {
    treeDataProvider: fileExplorerProvider,
    canSelectMany: false,
  });

  let acceptedSearchValue = '';
  let currentSearchValue = '';
  const searchBox = vscode.window.createInputBox();
  searchBox.placeholder = 'Filter files in tree view by comma-separated search terms...';
  searchBox.onDidAccept(() => {
    acceptedSearchValue = searchBox.value;
    currentSearchValue = acceptedSearchValue;
    fileExplorerProvider.setSearchTerms(acceptedSearchValue);
    searchBox.hide();
  });
  searchBox.onDidChangeValue(value => {
    currentSearchValue = value;
  });
  searchBox.onDidHide(() => {
    // Revert to the last accepted value if the box is closed without accepting
    currentSearchValue = acceptedSearchValue;
  });

  const toggleSearchBox = vscode.commands.registerCommand('extension.toggleSearchBox', () => {
    searchBox.value = currentSearchValue;
    searchBox.show();
  });

  const toggleFileSelection = vscode.commands.registerCommand(
    'extension.toggleFileSelection',
    (item: FileItem) => {
      fileExplorerProvider.toggleSelection(item);
    }
  );

  treeView.onDidChangeSelection(event => {
    event.selection.forEach(item => {
      if (!item.resourceUri) return;
      fileExplorerProvider.toggleSelection(item);
    });
  });

  const deselectAllFiles = vscode.commands.registerCommand('extension.deselectAllFiles', () => {
    const count = fileExplorerProvider.selected.size;
    fileExplorerProvider.selected.clear();
    vscode.window.showInformationMessage(`Deselected ${count} item(s)`);
    fileExplorerProvider.refresh();
  });

  const toggleExpanded = vscode.commands.registerCommand(
    'extension.toggleExpanded',
    (item: FileItem) => {
      fileExplorerProvider.toggleExpanded(item);
    }
  );

  treeView.onDidCollapseElement(event => {
    fileExplorerProvider.toggleExpanded(event.element);
  });

  treeView.onDidExpandElement(event => {
    fileExplorerProvider.toggleExpanded(event.element);
  });

  const createPrompt = vscode.commands.registerCommand(
    'extension.createContextPrompt',
    async () => {
      const selectedFilePaths = await fileExplorerProvider.getSelectedFiles();
      if (selectedFilePaths.length === 0) {
        vscode.window.showInformationMessage(
          'No files selected. Select files or folders in the tree view.'
        );
        return;
      }

      let contextPrompt = '';
      let noFiles = 0;
      for (const filePath of selectedFilePaths) {
        const stats = await fs.promises.stat(filePath);
        if (!stats.isDirectory()) {
          contextPrompt += await getFileContent(filePath, workspaceRoot);
          noFiles += 1;
        }
      }

      const totalTokenCount = fileExplorerProvider.getTotalTokenCount();

      await vscode.env.clipboard.writeText(contextPrompt);
      vscode.window.showInformationMessage(
        `Context with ${noFiles} item(s) copied to clipboard (${totalTokenCount} tokens)!`
      );
    }
  );

  const toggleMinification = vscode.commands.registerCommand(
    'contextPrompt.toggleMinification',
    async () => {
      const config = vscode.workspace.getConfiguration('contextPrompt');
      const currentValue = config.get<boolean>('minifyCode', false);
      await config.update('minifyCode', !currentValue, vscode.ConfigurationTarget.Global);

      const newState = !currentValue ? 'enabled' : 'disabled';
      vscode.window.showInformationMessage(`Code minification ${newState}.`);

      fileExplorerProvider.refresh();
    }
  );

  const updateExcludeList = vscode.commands.registerCommand(
    'contextPrompt.updateExcludeList',
    async () => {
      const config = vscode.workspace.getConfiguration('contextPrompt');
      const currentExcludeList = config.get<string[]>('excludeDirectories', []);
      const currentExcludeFileTypes = config.get<string[]>('excludeFileTypes', []);

      const excludeInput = await vscode.window.showInputBox({
        prompt: 'Enter comma-separated list of directories to exclude',
        value: currentExcludeList.join(', '),
      });

      const excludeFileTypesInput = await vscode.window.showInputBox({
        prompt: 'Enter comma-separated list of file extensions to exclude (e.g., .png)',
        value: currentExcludeFileTypes.join(', '),
      });

      if (excludeInput !== undefined) {
        const newExcludeList = excludeInput.split(',').map(item => item.trim());
        await config.update(
          'excludeDirectories',
          newExcludeList,
          vscode.ConfigurationTarget.Global
        );
      }

      if (excludeFileTypesInput !== undefined) {
        const newExcludeFileTypes = excludeFileTypesInput.split(',').map(item => item.trim());
        await config.update(
          'excludeFileTypes',
          newExcludeFileTypes,
          vscode.ConfigurationTarget.Global
        );
      }
      vscode.window.showInformationMessage('Exclude list successfully updated.');
      fileExplorerProvider.refresh();
    }
  );

  context.subscriptions.push(
    createPrompt,
    deselectAllFiles,
    toggleExpanded,
    toggleFileSelection,
    toggleMinification,
    toggleSearchBox,
    updateExcludeList
  );

  return { fileExplorerProvider };
}

export function deactivate() {
  // Clean up when the extension is deactivated
}
