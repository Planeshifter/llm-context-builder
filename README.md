# LLM Context Builder

> VS Code extension for building context prompts for Large Language Models (LLMs).

<p align="center">
  <img alt="LLM Context Builder Demo" src="media/screenshot.png" />
</p>

## Features

- 📁 Custom file explorer for easy selection of files and folders
- 🔢 Automatic token counting for selected content
- 🔍 File filtering with comma-separated search terms
- 🗜️ Optional code minification for JS/TS files
- ⚙️ Customizable directory and file type exclusions
- 📋 One-click context prompt generation and copying

## Install

1. Visit the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=yourusername.llm-context-builder)
2. Click "Install"
3. Reload VS Code when prompted

Or install from VS Code:

1. Open Extensions (Ctrl+Shift+X)
2. Search for "LLM Context Builder"
3. Click Install

## Usage

1. Open the LLM Context Builder view in the Explorer sidebar
2. Select files/folders to include in your context prompt
3. Use the search box to filter files
4. Click "Create Context Prompt" to generate and copy the prompt to the clipboard

## Commands

- `LLM Context Builder: Toggle Search Box`
- `LLM Context Builder: Deselect All Files`
- `LLM Context Builder: Create Context Prompt`
- `LLM Context Builder: Toggle Code Minification`
- `LLM Context Builder: Update Exclude List`

## Configuration

```jsonc
{
  "contextPrompt.excludeDirectories": [".git", "node_modules"],
  "contextPrompt.excludeFileTypes": [".jpg", ".png", ".pdf"],
  "contextPrompt.minifyCode": false,
}
```

## License

This project is licensed under the Blue Oak Model License 1.0.0.