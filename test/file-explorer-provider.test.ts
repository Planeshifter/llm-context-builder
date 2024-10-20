/* eslint-disable @typescript-eslint/no-explicit-any */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as sinon from 'sinon';
import { FileExplorerProvider } from '../src/file-explorer-provider';
import { FileItem } from '../src/file-item';

suite('FileExplorerProvider Test Suite', () => {
  let provider: FileExplorerProvider;
  const workspaceRoot = '/test/workspace';
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    provider = new FileExplorerProvider(workspaceRoot);

    // Mock fs.promises methods
    sandbox.stub(fs.promises, 'readdir');
    sandbox.stub(fs.promises, 'stat');
    sandbox.stub(fs.promises, 'readFile');
  });

  teardown(() => {
    sandbox.restore();
  });

  test('constructor initializes correctly', () => {
    assert.strictEqual((provider as any).workspaceRoot, workspaceRoot);
    assert.strictEqual((provider as any)._selected.size, 0);
    assert.strictEqual((provider as any).searchTerms.length, 0);
  });

  test('refresh method fires onDidChangeTreeData event', done => {
    provider.onDidChangeTreeData(() => {
      done();
    });
    provider.refresh();
  });

  test('getTreeItem returns correct TreeItem', () => {
    const fileUri = vscode.Uri.file(path.join(workspaceRoot, 'test.txt'));
    const fileItem = new FileItem(fileUri, false, false, 0);
    const treeItem = provider.getTreeItem(fileItem);

    assert.strictEqual(treeItem.label, 'test.txt');
    assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
  });
});
