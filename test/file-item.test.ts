import * as assert from 'assert';
import * as vscode from 'vscode';
import { FileItem } from '../src/file-item';

suite('FileItem Test Suite', () => {
  vscode.window.showInformationMessage('Start FileItem tests.');

  test('FileItem constructor for file', () => {
    const uri = vscode.Uri.file('/path/to/file.txt');
    const item = new FileItem(uri, true, false, 100);

    assert.strictEqual(item.resourceUri, uri);
    assert.strictEqual(item.isSelected, true);
    assert.strictEqual(item.isDirectory, false);
    assert.strictEqual(item.tokenCount, 100);
    assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.strictEqual(item.contextValue, 'file');
    assert.strictEqual(item.checkboxState, vscode.TreeItemCheckboxState.Checked);
    assert.deepStrictEqual(item.command, {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [uri],
    });
  });

  test('FileItem constructor for directory', () => {
    const uri = vscode.Uri.file('/path/to/directory');
    const item = new FileItem(uri, false, true, 0);

    assert.strictEqual(item.resourceUri, uri);
    assert.strictEqual(item.isSelected, false);
    assert.strictEqual(item.isDirectory, true);
    assert.strictEqual(item.tokenCount, 0);
    assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    assert.strictEqual(item.contextValue, 'directory');
    assert.strictEqual(item.checkboxState, vscode.TreeItemCheckboxState.Unchecked);
    assert.strictEqual(item.command, undefined);
  });

  test('FileItem label for file without tokens', () => {
    const uri = vscode.Uri.file('/path/to/file.txt');
    const item = new FileItem(uri, false, false, 0);

    assert.strictEqual(item.label, 'file.txt');
  });

  test('FileItem label for file with tokens', () => {
    const uri = vscode.Uri.file('/path/to/file.txt');
    const item = new FileItem(uri, true, false, 100);

    assert.strictEqual(item.label, 'file.txt (100 tokens)');
  });

  test('FileItem label for directory without tokens', () => {
    const uri = vscode.Uri.file('/path/to/directory');
    const item = new FileItem(uri, false, true, 0);

    assert.strictEqual(item.label, 'directory');
  });

  test('FileItem label for directory with tokens', () => {
    const uri = vscode.Uri.file('/path/to/directory');
    const item = new FileItem(uri, true, true, 500);

    assert.strictEqual(item.label, 'directory (500 tokens)');
  });

  test('FileItem updateLabel method', () => {
    const uri = vscode.Uri.file('/path/to/file.txt');
    const item = new FileItem(uri, true, false, 100);

    assert.strictEqual(item.label, 'file.txt (100 tokens)');

    item.tokenCount = 200;
    item.updateLabel();

    assert.strictEqual(item.label, 'file.txt (200 tokens)');
  });

  test('FileItem checkbox state for selected file', () => {
    const uri = vscode.Uri.file('/path/to/file.txt');
    const item = new FileItem(uri, true, false, 100);

    assert.strictEqual(item.checkboxState, vscode.TreeItemCheckboxState.Checked);
  });

  test('FileItem checkbox state for unselected file', () => {
    const uri = vscode.Uri.file('/path/to/file.txt');
    const item = new FileItem(uri, false, false, 0);

    assert.strictEqual(item.checkboxState, vscode.TreeItemCheckboxState.Unchecked);
  });

  test('FileItem checkbox state for selected directory with tokens', () => {
    const uri = vscode.Uri.file('/path/to/directory');
    const item = new FileItem(uri, true, true, 100);

    assert.strictEqual(item.checkboxState, vscode.TreeItemCheckboxState.Checked);
  });

  test('FileItem checkbox state for selected directory without tokens', () => {
    const uri = vscode.Uri.file('/path/to/directory');
    const item = new FileItem(uri, true, true, 0);

    assert.strictEqual(item.checkboxState, vscode.TreeItemCheckboxState.Checked);
  });

  test('FileItem checkbox state for unselected directory', () => {
    const uri = vscode.Uri.file('/path/to/directory');
    const item = new FileItem(uri, false, true, 0);

    assert.strictEqual(item.checkboxState, vscode.TreeItemCheckboxState.Unchecked);
  });
});
