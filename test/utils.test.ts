import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { FileItem } from '../src/file-item';
import { getLanguageFromFilename, stripLicenseHeaders, getLabelText } from '../src/utils';

suite('Utility Functions Test Suite', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('getLanguageFromFilename', () => {
    test('returns correct language for known extensions', () => {
      assert.strictEqual(getLanguageFromFilename('test.js'), 'javascript');
      assert.strictEqual(getLanguageFromFilename('test.py'), 'python');
      assert.strictEqual(getLanguageFromFilename('test.java'), 'java');
    });

    test('returns plaintext for unknown extensions', () => {
      assert.strictEqual(getLanguageFromFilename('test.unknown'), 'plaintext');
    });

    test('is case insensitive', () => {
      assert.strictEqual(getLanguageFromFilename('test.JS'), 'javascript');
      assert.strictEqual(getLanguageFromFilename('test.PY'), 'python');
    });
  });

  suite('stripLicenseHeaders', () => {
    test('strips multi-line license headers', () => {
      const code = `/*
 * Copyright 2023
 * Some license text
 */
function test() {
  console.log('Hello');
}`;
      const expected = `function test() {
  console.log('Hello');
}`;
      assert.strictEqual(stripLicenseHeaders(code), expected);
    });

    test('strips single-line license headers', () => {
      const code = `// Copyright 2023
// Some license text
function test() {
  console.log('Hello');
}`;
      const expected = `function test() {
  console.log('Hello');
}`;
      assert.strictEqual(stripLicenseHeaders(code), expected);
    });

    test('does not modify code without license headers', () => {
      const code = `function test() {
  console.log('Hello');
}`;
      assert.strictEqual(stripLicenseHeaders(code), code);
    });
  });

  suite('getLabelText', () => {
    test('returns string label', () => {
      const item = { label: 'test.js' } as FileItem;
      assert.strictEqual(getLabelText(item), 'test.js');
    });

    test('returns label from object', () => {
      const item = { label: { label: 'test.js' } } as FileItem;
      assert.strictEqual(getLabelText(item), 'test.js');
    });

    test('returns basename when label is not available', () => {
      const item = { resourceUri: vscode.Uri.file('/workspace/test.js') } as FileItem;
      assert.strictEqual(getLabelText(item), 'test.js');
    });
  });
});
