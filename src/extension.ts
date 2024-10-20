import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { encodingForModel } from 'js-tiktoken';
import throttle from 'lodash.throttle';

import {
  getFileContent,
  getLabelText,
  getLanguageFromFilename,
  stripLicenseHeaders,
  minifyCode,
} from './utils';
import { FileItem } from './file-item';

export class FileExplorerProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> =
    new vscode.EventEmitter<FileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private searchTerms: string[] = [];
  private expandedDirs: Set<string> = new Set();
  private tokenizer = encodingForModel('gpt-4');
  private directoryTokenCounts: Map<string, number> = new Map();
  private expandedItems: Set<string> = new Set();
  private excludeList: string[];
  private excludeFileTypes: string[];

  constructor(
    private workspaceRoot: string,
    private selectedFiles: Map<string, number>
  ) {
    this.updateDirectoryTokenCounts();
    this.refresh = throttle(this.refresh.bind(this), 500);
    this.excludeFileTypes = [];
    this.excludeList = [];
    this.loadExcludeConfigurations();
  }

  private loadExcludeConfigurations() {
    const config = vscode.workspace.getConfiguration('contextPrompt');
    this.excludeList = config.get<string[]>('excludeDirectories', ['.git', 'node_modules']);
    this.excludeFileTypes = config.get<string[]>('excludeFileTypes', [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.svg', // Images
      '.mp4',
      '.avi',
      '.mov',
      '.wmv', // Videos
      '.mp3',
      '.wav',
      '.ogg', // Audio
      '.pdf',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx', // Documents
      '.zip',
      '.rar',
      '.tar',
      '.gz', // Archives
      '.exe',
      '.dll',
      '.so', // Binaries
    ]);
  }

  refresh(): void {
    this.updateDirectoryTokenCounts();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    const treeItem = element;
    if (element.isDirectory) {
      treeItem.collapsibleState = this.expandedItems.has(element.resourceUri.fsPath)
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;
    }
    return treeItem;
  }

  public async toggleSelection(item: FileItem) {
    const filePath = item.resourceUri.fsPath;
    const newState = !this.isSelected(filePath);

    if (item.isDirectory) {
      if (this.searchTerms.length > 0) {
        await this.toggleDirectoryWithSearch(filePath, newState);
      } else {
        await this.toggleDirectorySelection(filePath, newState);
      }
    } else {
      await this.toggleFileSelection(filePath, newState);
    }

    this.updateDirectoryTokenCounts();
    this._onDidChangeTreeData.fire(); // Refresh the entire tree
  }

  private async toggleDirectoryWithSearch(dirPath: string, select: boolean) {
    const matchingFiles = await this.getMatchingFiles(dirPath);

    if (matchingFiles.length === 0) {
      vscode.window.showInformationMessage(
        `No matching files found in "${path.basename(dirPath)}" for the current search.`
      );
      return;
    }

    if (select) {
      for (const file of matchingFiles) {
        await this.addFile(file);
      }
      // Optionally, mark the directory itself as selected partially
      this.selectedFiles.set(dirPath, 0); // 0 can indicate partial selection
    } else {
      for (const file of matchingFiles) {
        this.selectedFiles.delete(file);
      }
      this.selectedFiles.delete(dirPath);
    }
  }

  private async getMatchingFiles(dirPath: string): Promise<string[]> {
    const allFiles = await this.getAllFiles(dirPath);
    if (this.searchTerms.length === 0) {
      return allFiles;
    }
    return allFiles.filter(file => this.pathMatchesSearch(path.relative(this.workspaceRoot, file)));
  }

  private async toggleDirectorySelection(dirPath: string, select: boolean) {
    if (select) {
      await this.addDirectory(dirPath);
    } else {
      await this.removeDirectory(dirPath);
    }
    // Optionally, update the selection state of the directory itself
    if (select) {
      this.selectedFiles.set(dirPath, 1); // 1 can indicate full selection
    } else {
      this.selectedFiles.delete(dirPath);
    }
  }

  private async addDirectory(dirPath: string) {
    const filesProcessed: string[] = [];
    let operationCancelled = false;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Adding directory: ${path.basename(dirPath)}`,
        cancellable: true,
      },
      async (progress, token) => {
        const files = await this.getAllFiles(dirPath, token);
        const totalFiles = files.length;
        let processedFiles = 0;

        for (const file of files) {
          if (token.isCancellationRequested) {
            operationCancelled = true;
            break;
          }
          await this.addFile(file);
          filesProcessed.push(file);
          processedFiles++;
          progress.report({
            message: `Processed ${processedFiles} of ${totalFiles} files`,
            increment: (1 / totalFiles) * 100,
          });
        }

        if (!operationCancelled) {
          this.selectedFiles.set(dirPath, 1); // 1 indicates full selection
        }
      }
    );

    if (operationCancelled) {
      // Revert changes for processed files
      for (const processedFile of filesProcessed) {
        this.selectedFiles.delete(processedFile);
      }
      this.selectedFiles.clear();
      vscode.window.showInformationMessage('Add directory operation cancelled.');
    }

    // Force a full refresh of the tree
    this._onDidChangeTreeData.fire();
  }

  private async removeDirectory(dirPath: string) {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Removing directory: ${path.basename(dirPath)}`,
        cancellable: true,
      },
      async (progress, token) => {
        const files = await this.getAllFiles(dirPath, token);
        const totalFiles = files.length;
        let processedFiles = 0;

        for (const file of files) {
          if (token.isCancellationRequested) {
            vscode.window.showInformationMessage('Remove directory operation cancelled.');
            break;
          }
          this.selectedFiles.delete(file);
          processedFiles++;
          progress.report({
            message: `Processed ${processedFiles} of ${totalFiles} files`,
            increment: (1 / totalFiles) * 100,
          });
        }
        // Remove the directory itself from selected files
        this.selectedFiles.delete(dirPath);
      }
    );
  }

  private async toggleFileSelection(filePath: string, select: boolean) {
    if (select) {
      await this.addFile(filePath);
    } else {
      this.selectedFiles.delete(filePath);
    }
    // Update parent directories
    await this.updateParentDirectorySelection(filePath);
  }

  private async updateParentDirectorySelection(filePath: string) {
    let dir = path.dirname(filePath);
    while (dir !== this.workspaceRoot && dir !== path.dirname(dir)) {
      const hasSelectedChildren = await this.directoryHasSelectedChildren(dir);
      if (hasSelectedChildren) {
        this.selectedFiles.set(dir, 0); // Mark directory as partially selected
      } else {
        this.selectedFiles.delete(dir);
      }
      dir = path.dirname(dir);
    }
  }

  private async directoryHasSelectedChildren(dirPath: string): Promise<boolean> {
    const files = await fs.promises.readdir(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      if (this.selectedFiles.has(fullPath)) {
        return true;
      }
      const stat = await fs.promises.stat(fullPath);
      if (stat.isDirectory() && (await this.directoryHasSelectedChildren(fullPath))) {
        return true;
      }
    }
    return false;
  }

  isSelected(filePath: string): boolean {
    return this.selectedFiles.has(filePath) && this.selectedFiles.get(filePath)! > 0;
  }

  toggleExpanded(item: FileItem) {
    const path = item.resourceUri.fsPath;
    if (this.expandedItems.has(path)) {
      this.expandedItems.delete(path);
    } else {
      this.expandedItems.add(path);
    }
    this._onDidChangeTreeData.fire(item); // Only fire change for the affected item
  }

  async getChildren(element?: FileItem): Promise<FileItem[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No workspace open');
      return Promise.resolve([]);
    }

    const dir = element ? element.resourceUri.fsPath : this.workspaceRoot;
    const items = await this.readDirectory(dir);
    return this.sortItems(items);
  }

  private async readDirectory(dir: string): Promise<FileItem[]> {
    const files = await fs.promises.readdir(dir);
    const items = await Promise.all(
      files
        .filter(file => !this.isExcluded(path.join(dir, file)))
        .map(async file => {
          const filePath = path.join(dir, file);
          const stat = await fs.promises.stat(filePath);
          const isDirectory = stat.isDirectory();
          const isSelected = this.isSelected(filePath);
          const tokenCount = isDirectory
            ? this.directoryTokenCounts.get(filePath) || 0
            : this.selectedFiles.get(filePath) || 0;
          return new FileItem(vscode.Uri.file(filePath), isSelected, isDirectory, tokenCount);
        })
    );

    return this.filterItems(items);
  }

  private isExcluded(filePath: string): boolean {
    const relativePath = path.relative(this.workspaceRoot, filePath);
    const isExcludedDirectory = this.excludeList.some(
      dir => relativePath.split(path.sep).includes(dir) || relativePath === dir
    );
    const isExcludedFileType = this.excludeFileTypes.some(ext =>
      filePath.toLowerCase().endsWith(ext.toLowerCase())
    );
    return isExcludedDirectory || isExcludedFileType;
  }

  private updateDirectoryTokenCounts() {
    this.directoryTokenCounts.clear();
    for (const [filePath, tokenCount] of this.selectedFiles.entries()) {
      let dir = path.dirname(filePath);
      while (dir !== this.workspaceRoot && dir !== path.dirname(dir)) {
        const currentCount = this.directoryTokenCounts.get(dir) || 0;
        this.directoryTokenCounts.set(dir, currentCount + tokenCount);
        dir = path.dirname(dir);
      }
      // Update the root directory count
      const rootCount = this.directoryTokenCounts.get(this.workspaceRoot) || 0;
      this.directoryTokenCounts.set(this.workspaceRoot, rootCount + tokenCount);
    }
  }

  private async addFile(filePath: string) {
    let content = await fs.promises.readFile(filePath, 'utf8');
    content = stripLicenseHeaders(content);

    const config = vscode.workspace.getConfiguration('contextPrompt');
    const minifyEnabled = config.get<boolean>('minifyCode', false);

    if (minifyEnabled) {
      const language = getLanguageFromFilename(filePath);
      if (language === 'typescript' || language === 'javascript') {
        content = await minifyCode(content);
      }
    }

    const tokenCount = this.tokenizer.encode(content).length;
    this.selectedFiles.set(filePath, tokenCount);
  }

  private async getAllFiles(dir: string, token?: vscode.CancellationToken): Promise<string[]> {
    if (token?.isCancellationRequested) {
      return [];
    }

    const files = await fs.promises.readdir(dir);
    const allFiles: string[] = [];

    for (const file of files) {
      if (token?.isCancellationRequested) {
        return allFiles;
      }

      const filePath = path.join(dir, file);
      if (this.isExcluded(filePath)) {
        continue;
      }

      const stat = await fs.promises.stat(filePath);

      if (stat.isDirectory()) {
        const subFiles = await this.getAllFiles(filePath, token);
        allFiles.push(...subFiles);
      } else {
        allFiles.push(filePath);
      }
    }
    return allFiles;
  }

  async getSelectedFiles(): Promise<string[]> {
    return Array.from(this.selectedFiles.keys());
  }

  getTotalTokenCount(): number {
    return this.directoryTokenCounts.get(this.workspaceRoot) || 0;
  }

  private async filterItems(items: FileItem[]): Promise<FileItem[]> {
    if (this.searchTerms.length === 0) {
      return items;
    }

    const matchingItems: FileItem[] = [];
    for (const item of items) {
      const itemPath = item.resourceUri.fsPath;
      const relativePath = path.relative(this.workspaceRoot, itemPath);
      if (this.pathMatchesSearch(relativePath)) {
        this.expandParentDirs(itemPath);
        matchingItems.push(item);
        continue;
      }
      if (item.isDirectory && (await this.hasMatchingChildren(itemPath))) {
        this.expandedDirs.add(itemPath);
        matchingItems.push(item);
      }
    }

    return matchingItems;
  }

  private expandParentDirs(itemPath: string) {
    let dir = path.dirname(itemPath);
    while (dir !== this.workspaceRoot && dir !== path.dirname(dir)) {
      this.expandedDirs.add(dir);
      dir = path.dirname(dir);
    }
    this.expandedDirs.add(this.workspaceRoot);
  }

  private sortItems(items: FileItem[]): FileItem[] {
    return items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return this.getSortableLabel(a).localeCompare(this.getSortableLabel(b));
    });
  }

  private getSortableLabel(item: FileItem): string {
    // Remove the checkmark from the label for sorting purposes:
    const label = getLabelText(item);
    return label;
  }

  private pathMatchesSearch(relativePath: string): boolean {
    return this.searchTerms.some(term => relativePath.toLowerCase().includes(term));
  }

  private async hasMatchingChildren(dirPath: string): Promise<boolean> {
    const files = await fs.promises.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const relativePath = path.relative(this.workspaceRoot, filePath);
      if (this.pathMatchesSearch(relativePath)) {
        return true;
      }
      const stat = await fs.promises.stat(filePath);
      if (stat.isDirectory() && (await this.hasMatchingChildren(filePath))) {
        return true;
      }
    }
    return false;
  }

  setSearchTerms(term: string) {
    this.searchTerms = term ? term.split(',').map(x => x.toLowerCase()) : [];
    this.expandedDirs.clear();
    if (term) {
      this.expandedDirs.add(this.workspaceRoot);
    }
    this.refresh();
  }
}

export async function activate(context: vscode.ExtensionContext) {
  const selectedFiles = new Map<string, number>();

  const workspaceRoot =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;

  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const fileExplorerProvider = new FileExplorerProvider(workspaceRoot, selectedFiles);
  const treeView = vscode.window.createTreeView('fileExplorer', {
    treeDataProvider: fileExplorerProvider,
    canSelectMany: false,
  });

  const searchBox = vscode.window.createInputBox();
  searchBox.placeholder = 'Filter files in tree view by comma-separated search terms...';
  searchBox.onDidChangeValue(value => {
    fileExplorerProvider.setSearchTerms(value);
  });

  const toggleSearchBox = vscode.commands.registerCommand('extension.toggleSearchBox', () => {
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
    const count = selectedFiles.size;
    selectedFiles.clear();
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
          'No files selected. Select files or folders in the Context Files view.'
        );
        return;
      }

      let contextPrompt = '';
      for (const filePath of selectedFilePaths) {
        const stats = await fs.promises.stat(filePath);
        if (!stats.isDirectory()) {
          contextPrompt += await getFileContent(filePath, workspaceRoot);
        }
      }

      const totalTokenCount = fileExplorerProvider.getTotalTokenCount();

      await vscode.env.clipboard.writeText(contextPrompt);
      vscode.window.showInformationMessage(
        `Context with ${selectedFilePaths.length} item(s) copied to clipboard (${totalTokenCount} tokens)!`
      );
    }
  );

  context.subscriptions.push(
    toggleSearchBox,
    toggleFileSelection,
    toggleExpanded,
    deselectAllFiles,
    createPrompt
  );

  const toggleMinification = vscode.commands.registerCommand(
    'contextPrompt.toggleMinification',
    async () => {
      const config = vscode.workspace.getConfiguration('contextPrompt');
      const currentValue = config.get<boolean>('minifyCode', false);
      await config.update('minifyCode', !currentValue, vscode.ConfigurationTarget.Global);

      const newState = !currentValue ? 'enabled' : 'disabled';
      vscode.window.showInformationMessage(`Code minification ${newState}.`);

      // Refresh the file explorer to update token counts
      fileExplorerProvider.refresh();
    }
  );

  context.subscriptions.push(toggleMinification);

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
        prompt: 'Enter comma-separated list of file extensions to exclude (include the dot)',
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

      vscode.window.showInformationMessage('Exclude list updated. Refreshing file explorer.');
      fileExplorerProvider.refresh();
    }
  );

  context.subscriptions.push(updateExcludeList);

  return { fileExplorerProvider };
}

export function deactivate() {
  // Clean up when the extension is deactivated
}
