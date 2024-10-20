import * as vscode from 'vscode';
import * as path from 'path';

export class FileItem extends vscode.TreeItem {
  constructor(
    public readonly resourceUri: vscode.Uri,
    public readonly isSelected: boolean,
    public readonly isDirectory: boolean,
    public tokenCount: number = 0
  ) {
    super(
      resourceUri,
      isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    this.updateLabel();
    this.contextValue = isDirectory ? 'directory' : 'file';

    if (isDirectory) {
      this.checkboxState = isSelected
        ? tokenCount > 0
          ? vscode.TreeItemCheckboxState.Checked
          : vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked;
    } else {
      this.checkboxState = isSelected
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked;
    }

    // Add command to open file when clicked
    if (!isDirectory) {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [this.resourceUri],
      };
    }
  }

  updateLabel() {
    const tokenCountDisplay = this.tokenCount > 0 ? ` (${this.tokenCount} tokens)` : '';
    this.label = `${path.basename(this.resourceUri.fsPath)}${tokenCountDisplay}`;
  }
}
