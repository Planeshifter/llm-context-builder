import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { encodingForModel } from 'js-tiktoken';
import throttle from 'lodash.throttle';

import { getLabelText, getLanguageFromFilename, stripLicenseHeaders, minifyCode } from './utils';
import { FileItem } from './file-item';

export class FileExplorerProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> =
    new vscode.EventEmitter<FileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private _selected: Map<string, number> = new Map();
  private searchTerms: string[] = [];
  private expandedDirs: Set<string> = new Set();
  private tokenizer = encodingForModel('gpt-4');
  private directoryTokenCounts: Map<string, number> = new Map();
  private expandedItems: Set<string> = new Set();
  private excludeList: string[];
  private excludeFileTypes: string[];

  constructor(private workspaceRoot: string) {
    this.updateDirectoryTokenCounts();
    this.refresh = throttle(this.refresh.bind(this), 500);
    this.excludeFileTypes = [];
    this.excludeList = [];
    this.loadExcludeConfigurations();
  }

  get selected(): typeof this._selected {
    return this._selected;
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
      this._selected.set(dirPath, 1); // 1 can indicate full selection
      // Set the parent directories to partially selected if needed
      await this.updateParentDirectoriesOnAdd(dirPath);
    } else {
      // Case: Deselect directory
      for (const file of matchingFiles) {
        this._selected.delete(file);
      }
      this._selected.delete(dirPath);
      // Set the parent directories to partially selected if needed
      await this.updateParentDirectorySelection(dirPath);
    }
  }

  private async getMatchingFiles(dirPath: string): Promise<string[]> {
    const { files } = await this.getAllChildren(dirPath);
    if (this.searchTerms.length === 0) {
      return files;
    }
    return files.filter(file => this.pathMatchesSearch(path.relative(this.workspaceRoot, file)));
  }

  private async toggleDirectorySelection(dirPath: string, select: boolean) {
    if (select) {
      await this.addDirectory(dirPath);
    } else {
      await this.removeDirectory(dirPath);
    }
    // Optionally, update the selection state of the directory itself
    if (select) {
      this._selected.set(dirPath, 1); // 1 can indicate full selection
    } else {
      this._selected.delete(dirPath);
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
        const { files, dirs } = await this.getAllChildren(dirPath, token);
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
          this._selected.set(dirPath, 1); // 1 indicates full selection
          dirs.forEach(dir => this._selected.set(dir, 1));
          await this.updateParentDirectoriesOnAdd(dirPath);
        }
      }
    );

    if (operationCancelled) {
      // Revert changes for processed files
      for (const processedFile of filesProcessed) {
        this._selected.delete(processedFile);
      }
      this._selected.clear();
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
        const { files, dirs } = await this.getAllChildren(dirPath, token);
        const totalFiles = files.length;
        let processedFiles = 0;

        for (const file of files) {
          if (token.isCancellationRequested) {
            vscode.window.showInformationMessage('Remove directory operation cancelled.');
            break;
          }
          this._selected.delete(file);
          processedFiles++;
          progress.report({
            message: `Processed ${processedFiles} of ${totalFiles} files`,
            increment: (1 / totalFiles) * 100,
          });
        }
        // Remove the directory itself from selected files
        this._selected.delete(dirPath);
        dirs.forEach(dir => this._selected.delete(dir));
        // Set the parent directories to partially selected if needed
        await this.updateParentDirectorySelection(dirPath);
      }
    );
  }

  private async toggleFileSelection(filePath: string, select: boolean) {
    if (select) {
      await this.addFile(filePath);
      await this.updateParentDirectoriesOnAdd(filePath);
    } else {
      this._selected.delete(filePath);
      // Set the parent directories to partially selected if needed
      await this.updateParentDirectorySelection(filePath);
    }
  }

  private async updateParentDirectoriesOnAdd(filePath: string) {
    let dir = path.dirname(filePath);
    while (dir !== this.workspaceRoot && dir !== path.dirname(dir)) {
      const isFullySelected = await this.checkDirectoryFullySelected(dir);
      this._selected.set(dir, isFullySelected ? 1 : 0);
      if (!isFullySelected) {
        // If not fully selected, we don't need to check further up...
        break;
      }
      dir = path.dirname(dir);
    }
    // Update the root directory:
    const isRootFullySelected = await this.checkDirectoryFullySelected(this.workspaceRoot);
    this._selected.set(this.workspaceRoot, isRootFullySelected ? 1 : 0);
  }

  private async checkDirectoryFullySelected(dirPath: string): Promise<boolean> {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (this.isExcluded(fullPath)) {
        continue;
      }
      const relativePath = path.relative(this.workspaceRoot, fullPath);
      if (this.searchTerms.length > 0 && !this.pathMatchesSearch(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        const dirSelection = this._selected.get(fullPath);
        if (dirSelection !== 1) {
          const hasSelectedChildren = await this.directoryHasSelectedChildren(fullPath);
          if (hasSelectedChildren) {
            return false;
          }
        }
      } else {
        if (!this._selected.has(fullPath)) {
          return false;
        }
      }
    }
    return true;
  }

  private async updateParentDirectorySelection(filePath: string) {
    let dir = path.dirname(filePath);
    while (dir !== this.workspaceRoot && dir !== path.dirname(dir)) {
      const hasSelectedChildren = await this.directoryHasSelectedChildren(dir);
      if (hasSelectedChildren) {
        this._selected.set(dir, 0); // Mark directory as partially selected
      } else {
        this._selected.delete(dir);
      }
      dir = path.dirname(dir);
    }
  }

  private async directoryHasSelectedChildren(dirPath: string): Promise<boolean> {
    const files = await fs.promises.readdir(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      if (this._selected.has(fullPath)) {
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
    return this._selected.has(filePath) && this._selected.get(filePath)! > 0;
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
            : this._selected.get(filePath) || 0;
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
    for (const [filePath, tokenCount] of this._selected.entries()) {
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
    this._selected.set(filePath, tokenCount);
    await this.updateParentDirectorySelection(filePath);
  }

  private async getAllChildren(
    dir: string,
    token?: vscode.CancellationToken
  ): Promise<{ files: string[]; dirs: string[] }> {
    if (token?.isCancellationRequested) {
      return { files: [], dirs: [] };
    }
    const files = await fs.promises.readdir(dir);
    const allFiles: string[] = [];
    const allDirs: string[] = [];

    for (const file of files) {
      if (token?.isCancellationRequested) {
        return { files: allFiles, dirs: [] };
      }
      const filePath = path.join(dir, file);
      if (this.isExcluded(filePath)) {
        continue;
      }

      const stat = await fs.promises.stat(filePath);
      if (stat.isDirectory()) {
        const { files, dirs } = await this.getAllChildren(filePath, token);
        allDirs.push(filePath, ...dirs);
        allFiles.push(...files);
      } else {
        allFiles.push(filePath);
      }
    }
    return { files: allFiles, dirs: allDirs };
  }

  async getSelectedFiles(): Promise<string[]> {
    return Array.from(this._selected.keys());
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
      return getLabelText(a).localeCompare(getLabelText(b));
    });
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
