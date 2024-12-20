# LLM Context Builder

![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/philipp-burckhardt.llm-context-builder)
![Visual Studio Marketplace Installs - Azure DevOps Extension](https://img.shields.io/visual-studio-marketplace/azure-devops/installs/total/philipp-burckhardt.llm-context-builder)
[![GitHub Actions Workflow Status](https://github.com/Planeshifter/llm-context-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/Planeshifter/llm-context-builder/actions/workflows/ci.yml)

> VS Code extension for building context prompts for Large Language Models (LLMs).

<p align="center">
  <img alt="LLM Context Builder Demo" src="https://raw.githubusercontent.com/Planeshifter/llm-context-builder/refs/heads/main/media/demo.gif" style="width: 75%; height: 75%; border: 1px solid #000000; border-radius: 4px;"">
</p>

## Features

- 📁 Custom file explorer for easy selection of files and folders
- 🔢 Automatic token counting for selected content
- 🔍 File filtering with comma-separated search terms
- 🗜️ Optional code minification for JS/TS files
- ⚙️ Customizable directory and file type exclusions
- 📋 One-click context prompt generation and copying

## Install

- **From Visual Studio Marketplace**: Install directly from the [marketplace](https://marketplace.visualstudio.com/items?itemName=philipp-burckhardt.llm-context-builder) and reload VS Code if prompted.
- **From within Visual Studio Code**: Open Extensions (Ctrl+Shift+X), search "LLM Context Builder", and click Install.

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
- `LLM Context Builder: Open Selected Files`
- `LLM Context Builder: Select All Files`

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
