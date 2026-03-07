# Obsidian Drawio Integration

[中文](./README.md) | English

Create and edit Draw.io diagrams in Obsidian with SVG preview and auto-refresh.

## Features

### 1. Right-Click to Create Diagram
- Right-click on a folder → `New Drawio` to create SVG + drawio file pair
- drawio files use `.auto-create.drawio` suffix to avoid conflicts with regular files

### 2. Right-Click to Edit Diagram
- Right-click on SVG file → `Edit Drawio` to open with Draw.io desktop app
- Supports Mac/Windows/Linux
- Automatically detects Draw.io installation path

### 3. Right-Click to Delete Diagram
- Right-click on SVG file → `Delete Drawio (svg + drawio)` or `Delete Drawio (svg only)`
- Deletes both SVG and associated drawio files
- Automatically cleans up SVG references in Markdown files

### 4. Auto-Refresh
- After saving in Draw.io, Obsidian automatically converts XML to SVG
- SVG preview refreshes automatically without manual refresh

### 5. File Sync
- When renaming SVG, the associated drawio is automatically renamed
- When deleting SVG, the associated drawio is automatically deleted
- If renaming would cause conflict (e.g., same-named drawio exists), user is prompted and rename is blocked

### 6. Quick Insert
- Right-click in Markdown editor → `Insert New Drawio`
- Creates diagram at current cursor position
- Files saved in `./assets` directory (auto-created)
- Automatically inserts Markdown image syntax: `![](assets/drawio-xxx.svg)`

## Prerequisites

- Recommended: Install [Draw.io Desktop](https://github.com/jgraph/drawio-desktop/releases) (not the online version)
- Mac users: Install to `/Applications/draw.io.app` or `/Applications/Diagrams.net.app`
- Windows users: Install to `%LOCALAPPDATA%\draw.io\draw.io.exe`
- Linux users: Install `drawio` or `diagramsnet`
- If Draw.io desktop is not installed, browser-based online editor will be opened automatically

## Installation

### Manual Installation
1. Clone this repo to Obsidian plugins directory:
   ```
   ~/.obsidian/plugins/obsidian-drawio-integration/
   ```
2. Restart Obsidian
3. Enable plugin in Settings

### Build from Source
```bash
npm install
npm run build
```

## File Structure

```
obsidian-drawio-integration/
├── manifest.json    # Plugin manifest
├── main.js          # Plugin source code
└── README.md        # Documentation
```

## Quick Actions

| Action | Trigger | Description |
|--------|---------|-------------|
| New Diagram | Folder right-click → New Drawio | Creates SVG + drawio |
| Edit Diagram | SVG right-click → Edit Drawio | Opens in Draw.io |
| Delete Diagram | SVG right-click → Delete Drawio | Deletes SVG + drawio |
| Insert Diagram | Editor right-click → Insert New Drawio | Inserts at cursor |

## Notes

- drawio files use `.auto-create.drawio` suffix as marker
- Diagrams inserted in editor are saved in `./assets` folder in the current directory
- If Draw.io desktop is not installed, browser-based online editor will be used

## License

MIT License


## Screenshots

<img width="3840" height="1222" alt="image" src="https://github.com/user-attachments/assets/9d6ac82a-48a3-40f4-94ce-31615fd44bcb" />



<img width="1920" height="958" alt="image" src="https://github.com/user-attachments/assets/fda9cece-a9da-482e-a4a6-f3e89f2ad794" />

Click edit to automatically show popup



<img width="3840" height="1444" alt="image" src="https://github.com/user-attachments/assets/a26adce0-f198-43d9-9c13-179ae29c0954" />
