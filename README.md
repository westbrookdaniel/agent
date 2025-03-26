# Agent

A command-line AI agent tool built that provides a Claude Code or Cursor Agent like experience.

## Features

- **Permission-Based Security**: Asks for permission before executing potentially dangerous operations
- **Built-in Tools**:
  - `bash`: Executes shell commands with permission controls
  - `glob`: Finds files based on pattern matching
  - `grep`: Searches for patterns in file contents
  - `ls`: Lists files and directories
  - `file_read`: Reads the contents of files
  - `file_edit`: Makes targeted edits to specific files
  - `file_write`: Creates or overwrites files

## Installation

To install dependencies:

```bash
bun install
```

## Usage

Run the agent with a prompt:

```bash
bun run index.ts "your prompt here"
```

Or use the dev script:

```bash
bun dev "your prompt here"
```

## Compilation

You can compile the agent to a standalone binary:

```bash
bun compile
```

This will create an executable file named `agent` that you can run directly.

## Environment Variables

- `YOLO`: If set, bypasses permission prompts (use with caution)

## Development

This project was created using [Bun](https://bun.sh).
