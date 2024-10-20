import * as path from 'path';
import { readFile } from 'fs/promises';
import * as vscode from 'vscode';

import { FileItem } from './file-item';

/**
 * Determines the programming language based on the file extension of the given filename.
 *
 * @param filename - name of the file whose language needs to be determined
 * @returns programming language corresponding to the file extension. If the extension is not recognized, it returns 'plaintext'
 */
export function getLanguageFromFilename(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  const languageMap: { [key: string]: string } = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cs': 'csharp',
    '.html': 'html',
    '.css': 'css',
    '.php': 'php',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.m': 'objective-c',
    '.mm': 'objective-cpp',
    '.sh': 'bash',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.r': 'r',
    '.vb': 'vbnet',
    '.fs': 'fsharp',
    '.md': 'markdown',
    '.json': 'json',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.txt': 'plaintext',
  };
  return languageMap[extension] || 'plaintext';
}

/**
 * Strips license headers from the given code.
 *
 * -   Assumes license headers are at the top of the file.
 * -   Supports single-line and multi-line comments.
 *
 * @param code - original code content
 * @returns code without license headers
 */
export function stripLicenseHeaders(code: string): string {
  const lines = code.split('\n');
  let startIndex = 0;

  // Remove multi-line license headers:
  if (lines[0].startsWith('/*')) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('*/')) {
        startIndex = i + 1;
        break;
      }
    }
  }
  // Remove single-line license headers:
  else if (lines[0].startsWith('//')) {
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('//')) {
        startIndex = i;
        break;
      }
    }
  }

  return lines.slice(startIndex).join('\n').trim();
}

/**
 * Minifies the given code using esbuild.
 *
 * @param code - original code content
 * @returns minified code
 */
export async function minifyCode(code: string): Promise<string> {
  try {
    const esbuild = await import('esbuild');
    const result = await esbuild.transform(code, {
      minify: true,
      minifyWhitespace: true,
      minifySyntax: false,
      minifyIdentifiers: false,
      keepNames: true,
      target: 'es2015',
      loader: 'ts',
    });
    return result.code;
  } catch (error: unknown) {
    if (error instanceof Error) {
      vscode.window.showInformationMessage(
        `Failed to minify code. Error: ${error.message}. Using original code.`
      );
    }
    return code; // Return original code if minification fails...
  }
}

/**
 * Reads the content of the given file and returns it in a markdown code block.
 *
 * @param filePath - path to the file whose content needs to be read
 * @param workspaceRoot - path to the workspace root directory
 * @returns markdown code block containing the file content
 */
export async function getFileContent(filePath: string, workspaceRoot: string): Promise<string> {
  const relativePath = path.relative(workspaceRoot, filePath);
  let content = await readFile(filePath, 'utf8');
  content = stripLicenseHeaders(content);

  const language = getLanguageFromFilename(filePath);

  // Check if minification is enabled...
  const config = vscode.workspace.getConfiguration('contextPrompt');
  const minifyEnabled = config.get<boolean>('minifyCode', false);
  if (minifyEnabled && (language === 'typescript' || language === 'javascript')) {
    content = await minifyCode(content);
  }

  return `File: ${relativePath}\n\n\`\`\`${language}\n${content}\n\`\`\`\n\n`;
}

/**
 * Returns the label text for the given file item.
 *
 * @param item - file item whose label text needs to be determined
 * @returns label text for the file item
 */
export function getLabelText(item: FileItem): string {
  if (typeof item.label === 'string') {
    return item.label;
  } else if (item.label && typeof item.label === 'object') {
    return item.label.label;
  }
  return path.basename(item.resourceUri.fsPath);
}
