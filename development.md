# Development Guide for LLM Context Builder

This guide provides instructions for setting up your development environment, building the extension, and running tests.

## Prerequisites

- Node.js (v14 or later recommended)
- npm (usually comes with Node.js)
- Visual Studio Code

## Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/Planeshifter/llm-context-builder.git
   cd llm-context-builder
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Building the Extension

To build the extension, run:

```bash
npm run compile
```

This will compile the TypeScript files into JavaScript.

## Running Tests

To run the tests:

```bash
npm test
```

## Packaging the Extension

1. Install vsce if you haven't already:

   ```bash
   npm install -g @vscode/vsce
   ```

2. Package your extension:

   ```bash
   vsce package
   ```

   This will create a `.vsix` file in your project directory.

## Debugging

1. Open the project in Visual Studio Code.
2. Press F5 to start debugging. This will open a new VS Code window with the extension loaded.
3. You can set breakpoints in the TypeScript files to debug the extension.

## Contributing

1. Fork the repository on GitHub.
2. Create a new branch for your feature or bug fix.
3. Make your changes and commit them with clear, descriptive commit messages.
4. Push your branch and submit a pull request.

Please ensure that your code follows the existing style conventions and includes appropriate tests.

## Additional Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Samples](https://github.com/Microsoft/vscode-extension-samples)
