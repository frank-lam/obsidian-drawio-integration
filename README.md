# Obsidian Drawio Integration

中文 | [English](./README_EN.md)

在 Obsidian 中创建和编辑 Draw.io 图表，支持 SVG 预览和自动刷新。

## 功能特性

### 1. 右键创建图表
- 在文件夹上右键 → `New Drawio` 创建 SVG + XML 文件对
- XML 文件使用 `.auto-create-drawio.xml` 后缀，避免与普通 XML 文件冲突

### 2. 右键编辑图表
- 在 SVG 文件上右键 → `Edit Drawio` 用 Draw.io 桌面版打开
- 支持 Mac/Windows/Linux
- 自动检测 Draw.io 安装路径

### 3. 自动刷新
- 在 Draw.io 中保存后，Obsidian 自动将 XML 转换为 SVG
- SVG 预览自动刷新，无需手动刷新

### 4. 文件同步
- 重命名 SVG 时，关联的 XML 自动重命名
- 删除 SVG 时，关联的 XML 自动删除

### 5. 快速插入
- 在 Markdown 编辑器中右键 → `Insert New Drawio`
- 在当前光标位置创建图表
- 文件保存在 `./assets` 目录（自动创建）
- 自动插入 Markdown 图片语法：`![](assets/drawio-xxx.svg)`

## 使用前提

- 安装 [Draw.io Desktop](https://github.com/jgraph/drawio-desktop/releases)（非在线版）
- Mac 用户：安装 `/Applications/draw.io.app`
- Windows 用户：安装 draw.io.exe

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
| 新建图表 | 文件夹右键 → New Drawio | 创建 SVG + XML |
| 编辑图表 | SVG 右键 → Edit Drawio | 用 Draw.io 打开 |
| 插入图表 | 编辑器右键 → Insert New Drawio | 光标处插入 |

## 注意事项

- 仅支持 Draw.io 桌面版，不支持在线版
- XML 文件使用 `.auto-create-drawio.xml` 后缀标记
- 编辑器内插入的图表保存在 `./assets` 目录

## 开源协议

MIT License


## 效果图

<img width="3840" height="1222" alt="image" src="https://github.com/user-attachments/assets/9d6ac82a-48a3-40f4-94ce-31615fd44bcb" />



<img width="1920" height="958" alt="image" src="https://github.com/user-attachments/assets/fda9cece-a9da-482e-a4a6-f3e89f2ad794" />

点击编辑后自动弹窗展示

<img width="3840" height="1444" alt="image" src="https://github.com/user-attachments/assets/a26adce0-f198-43d9-9c13-179ae29c0954" />

