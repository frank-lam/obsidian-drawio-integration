# Obsidian Drawio Integration

中文 | [English](./README_EN.md)

在 Obsidian 中创建和编辑 Draw.io 图表，支持 SVG 预览和自动刷新。

## 功能特性

### 1. 右键创建图表
- 在文件夹上右键 → `New Drawio` 创建 SVG + drawio 文件对
- drawio 文件使用 `.auto-create.drawio` 后缀，避免与普通文件冲突

### 2. 右键编辑图表
- 在 SVG 文件上右键 → `Edit Drawio` 用 Draw.io 桌面版打开
- 支持 Mac/Windows/Linux
- 自动检测 Draw.io 安装路径

### 3. 右键删除图表
- 在 SVG 文件上右键 → `Delete Drawio (svg + drawio)` 或 `Delete Drawio (svg only)`
- 同时删除 SVG 和关联的 drawio 文件
- 自动清理 Markdown 文件中对该 SVG 的引用

### 4. 自动刷新
- 在 Draw.io 中保存后，Obsidian 自动将 XML 转换为 SVG
- SVG 预览自动刷新，无需手动刷新

### 5. 文件同步
- 重命名 SVG 时，关联的 drawio 自动重命名
- 删除 SVG 时，关联的 drawio 自动删除
- 如果重命名会导致冲突（如已存在同名 drawio），会提示用户并阻止重命名

### 6. 快速插入
- 在 Markdown 编辑器中右键 → `Insert New Drawio`
- 在当前光标位置创建图表
- 文件保存在 `./assets` 目录（自动创建）
- 自动插入 Markdown 图片语法：`![](assets/drawio-xxx.svg)`

## 使用前提

- 推荐安装 [Draw.io Desktop](https://github.com/jgraph/drawio-desktop/releases)（非在线版）
- Mac 用户：安装到 `/Applications/draw.io.app` 或 `/Applications/Diagrams.net.app`
- Windows 用户：安装到 `%LOCALAPPDATA%\draw.io\draw.io.exe`
- Linux 用户：安装 `drawio` 或 `diagramsnet`
- 如未安装 Draw.io 桌面版，将自动打开浏览器在线编辑

## 安装方法

### 手动安装
1. 克隆本仓库到 Obsidian 插件目录：
   ```
   ~/.obsidian/plugins/obsidian-drawio-integration/
   ```
2. 重启 Obsidian
3. 在设置中启用插件

### 从源码构建
```bash
npm install
npm run build
```

## 文件结构

```
obsidian-drawio-integration/
├── manifest.json    # 插件清单
├── main.js          # 插件源码
└── README.md        # 使用说明
```

## 快捷操作

| 操作 | 触发方式 | 说明 |
|------|----------|------|
| 新建图表 | 文件夹右键 → New Drawio | 创建 SVG + drawio |
| 编辑图表 | SVG 右键 → Edit Drawio | 用 Draw.io 打开 |
| 删除图表 | SVG 右键 → Delete Drawio | 删除 SVG + drawio |
| 插入图表 | 编辑器右键 → Insert New Drawio | 光标处插入 |

## 注意事项

- drawio 文件使用 `.auto-create.drawio` 后缀标记
- 编辑器内插入的图表保存在当前目录的 `./assets` 文件夹
- 如未安装 Draw.io 桌面版，将自动使用浏览器在线编辑

## 开源协议

MIT License


## 效果图

<img width="3840" height="1222" alt="image" src="https://github.com/user-attachments/assets/9d6ac82a-48a3-40f4-94ce-31615fd44bcb" />



<img width="1920" height="958" alt="image" src="https://github.com/user-attachments/assets/fda9cece-a9da-482e-a4a6-f3e89f2ad794" />

点击编辑后自动弹窗展示

<img width="3840" height="1444" alt="image" src="https://github.com/user-attachments/assets/a26adce0-f198-43d9-9c13-179ae29c0954" />

