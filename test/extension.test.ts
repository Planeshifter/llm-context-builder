import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { FileExplorerProvider } from '../src/file-explorer-provider';
import { FileItem } from '../src/file-item';

suite('Extension Test Suite', () => {
  test('FileExplorerProvider initializes correctly', () => {
    const workspaceRoot = '/test/workspace';
    const provider = new FileExplorerProvider(workspaceRoot);
    assert.strictEqual(provider['workspaceRoot'], workspaceRoot);
    assert.strictEqual(provider['_selected'].size, 0);
  });

  test('FileItem creates correct label', () => {
    const fileUri = vscode.Uri.file(path.join('/test', 'file.txt'));
    const fileItem = new FileItem(fileUri, false, false, 0);
    assert.strictEqual(fileItem.label, 'file.txt');

    const selectedFileItem = new FileItem(fileUri, true, false, 100);
    assert.strictEqual(selectedFileItem.label, 'file.txt (100 tokens)');

    const dirUri = vscode.Uri.file(path.join('/test', 'dir'));
    const dirItem = new FileItem(dirUri, false, true, 0);
    assert.strictEqual(dirItem.label, 'dir');

    const selectedDirItem = new FileItem(dirUri, true, true, 200);
    assert.strictEqual(selectedDirItem.label, 'dir (200 tokens)');
  });
});
