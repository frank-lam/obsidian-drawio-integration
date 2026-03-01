"use strict";
var e = require("obsidian");
var child_process = require("child_process");
var fs = require("fs");

const XML_SUFFIX = ".auto-create-drawio";

const DRAWIO_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="now" agent="Obsidian" version="21.0.0">
  <diagram name="Page-1">
    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

const SVG_PLACEHOLDER = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <text x="200" y="150" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#666">Click "Edit Drawio" to edit</text>
</svg>`;

class DrawioIntegration extends e.Plugin {
  async onload() {
    this.fileChangeTimers = new Map();
    this.lastModifiedTimes = new Map();
    this.pollIntervals = new Map();

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof e.TFolder) {
          menu.addItem((item) => {
            item
              .setTitle("New Drawio")
              .setIcon("document")
              .onClick(() => this.createNewDrawio(file));
          });
        }
        
        if (file instanceof e.TFile && file.extension === "svg") {
          menu.addItem((item) => {
            item
              .setTitle("Edit Drawio")
              .setIcon("pencil")
              .onClick(() => this.editDrawio(file));
          });
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        menu.addItem((item) => {
          item
            .setTitle("Insert New Drawio")
            .setIcon("plus")
            .onClick(() => this.insertNewDrawioAtCursor(view.file, editor));
        });
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof e.TFile && file.extension === "svg") {
          this.handleSvgRename(file, oldPath);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof e.TFile && file.extension === "svg") {
          this.handleSvgDelete(file);
        }
      })
    );
  }

  async handleSvgRename(svgFile, oldPath) {
    const oldXmlPath = oldPath.replace(".svg", XML_SUFFIX + ".xml");
    const newBaseName = svgFile.basename;
    const newXmlPath = oldPath.replace(/\/[^/]+$/, "/" + newBaseName + XML_SUFFIX + ".xml");
    
    const oldXmlFile = this.app.vault.getAbstractFileByPath(oldXmlPath);
    const newXmlFile = this.app.vault.getAbstractFileByPath(newXmlPath);
    
    if (oldXmlFile && !newXmlFile) {
      try {
        await this.app.vault.rename(oldXmlFile, newXmlPath);
        new e.Notice(`重命名 XML: ${oldXmlFile.name} → ${newBaseName}${XML_SUFFIX}.xml`);
      } catch (err) {
        console.error("重命名XML失败:", err);
      }
    }
  }

  async handleSvgDelete(svgFile) {
    const xmlPath = svgFile.path.replace(".svg", XML_SUFFIX + ".xml");
    const xmlFile = this.app.vault.getAbstractFileByPath(xmlPath);
    
    if (xmlFile) {
      try {
        await this.app.vault.delete(xmlFile);
        new e.Notice(`已删除关联的 XML 文件`);
      } catch (err) {
        console.error("删除XML失败:", err);
      }
    }
  }

  startPolling(xmlFile, svgFile) {
    const basePath = this.app.vault.adapter.getBasePath();
    const xmlFullPath = basePath + "/" + xmlFile.path;
    
    if (this.pollIntervals.has(xmlFile.path)) {
      return;
    }

    try {
      const stats = fs.statSync(xmlFullPath);
      this.lastModifiedTimes.set(xmlFile.path, stats.mtimeMs);
    } catch (e) {}

    const interval = setInterval(async () => {
      try {
        const stats = fs.statSync(xmlFullPath);
        const lastTime = this.lastModifiedTimes.get(xmlFile.path) || 0;
        
        if (stats.mtimeMs > lastTime) {
          this.lastModifiedTimes.set(xmlFile.path, stats.mtimeMs);
          await this.updateSvgFromXml(xmlFile, svgFile);
        }
      } catch (e) {
        clearInterval(interval);
        this.pollIntervals.delete(xmlFile.path);
      }
    }, 1000);

    this.pollIntervals.set(xmlFile.path, interval);
  }

  stopPolling(xmlPath) {
    const interval = this.pollIntervals.get(xmlPath);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(xmlPath);
    }
  }

  async updateSvgFromXml(xmlFile, svgFile) {
    const basePath = this.app.vault.adapter.getBasePath();
    const xmlFullPath = basePath + "/" + xmlFile.path;
    const svgFullPath = basePath + "/" + svgFile.path;

    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const isMac = process.platform === "darwin";
      let drawioCmd = "";
      
      if (isMac) {
        drawioCmd = `"/Applications/draw.io.app/Contents/MacOS/draw.io" -x -f svg -o "${svgFullPath}" "${xmlFullPath}"`;
      } else {
        drawioCmd = `"${basePath}/draw.io.exe" -x -f svg -o "${svgFullPath}" "${xmlFullPath}"`;
      }

      child_process.execSync(drawioCmd, { encoding: "utf8" });

      const svgContent = fs.readFileSync(svgFullPath, "utf8");
      await this.app.vault.adapter.write(svgFile.path, svgContent);

      this.refreshSvgView(svgFile);
      
      new e.Notice("SVG updated!");
    } catch (err) {
      console.error("SVG conversion error:", err);
      new e.Notice("SVG update failed: " + err.message);
    }
  }

  refreshSvgView(svgFile) {
    const svgPath = svgFile.path;
    
    setTimeout(() => {
      const allLeaves = this.app.workspace.getLeaves();
      
      for (const leaf of allLeaves) {
        const container = leaf.containerEl;
        if (!container) continue;
        
        const images = container.querySelectorAll('img, svg');
        images.forEach(img => {
          try {
            const src = img.src || (img.outerHTML && img.outerHTML.match(/src="([^"]+)"/)?.[1]);
            if (src) {
              const decodedSrc = decodeURIComponent(src);
              if (decodedSrc.includes(svgPath)) {
                const separator = src.includes("?") ? "&" : "?";
                const baseUrl = src.split("?")[0];
                img.src = baseUrl + separator + "v=" + Date.now();
                console.log("Refreshed SVG image:", img.src);
              }
            }
          } catch (e) {
            console.log("Refresh error:", e);
          }
        });
      }
      
      this.app.metadataCache.trigger(this.app, svgFile);
      console.log("SVG refresh triggered for:", svgPath);
    }, 500);
  }

  async createNewDrawio(folder) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const timestamp = `${year}${month}${day}-${hours}${minutes}${seconds}`;
    
    const baseName = `drawio-${timestamp}`;
    
    const svgPath = folder.path === "/" ? `/${baseName}.svg` : `${folder.path}/${baseName}.svg`;
    const xmlPath = folder.path === "/" ? `/${baseName}${XML_SUFFIX}.xml` : `${folder.path}/${baseName}${XML_SUFFIX}.xml`;
    
    await this.app.vault.create(svgPath, SVG_PLACEHOLDER);
    await this.app.vault.create(xmlPath, DRAWIO_TEMPLATE);
    
    new e.Notice(`Created ${baseName}.svg and ${baseName}${XML_SUFFIX}.xml`);
  }

  async insertNewDrawioAtCursor(mdFile, editor) {
    const folder = mdFile.parent;
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const timestamp = `${year}${month}${day}-${hours}${minutes}${seconds}`;
    
    const baseName = `drawio-${timestamp}`;
    const assetsFolderPath = folder.path === "/" ? "/assets" : `${folder.path}/assets`;
    
    let assetsFolder = this.app.vault.getAbstractFileByPath(assetsFolderPath);
    if (!assetsFolder) {
      await this.app.vault.createFolder(assetsFolderPath);
      assetsFolder = this.app.vault.getAbstractFileByPath(assetsFolderPath);
    }
    
    const svgPath = `${assetsFolderPath}/${baseName}.svg`;
    const xmlPath = `${assetsFolderPath}/${baseName}${XML_SUFFIX}.xml`;
    
    await this.app.vault.create(svgPath, SVG_PLACEHOLDER);
    await this.app.vault.create(xmlPath, DRAWIO_TEMPLATE);

    const embedText = `![](assets/${baseName}.svg)`;

    const cursor = editor.getCursor();
    editor.replaceRange(embedText + "\n", cursor);

    new e.Notice(`插入 Drawio: ${baseName}.svg`);
  }

  async editDrawio(svgFile) {
    const baseName = svgFile.basename;
    const folder = svgFile.parent;
    const xmlPath = folder.path === "/" ? `/${baseName}${XML_SUFFIX}.xml` : `${folder.path}/${baseName}${XML_SUFFIX}.xml`;
    
    let xmlFile = this.app.vault.getAbstractFileByPath(xmlPath);
    
    if (!xmlFile) {
      try {
        await this.app.vault.create(xmlPath, DRAWIO_TEMPLATE);
        xmlFile = this.app.vault.getAbstractFileByPath(xmlPath);
      } catch (err) {
        console.error("Error creating xml:", err);
      }
    }
    
    if (!xmlFile) {
      new e.Notice("Cannot access xml file!");
      return;
    }

    const basePath = this.app.vault.adapter.getBasePath();
    const xmlFullPath = basePath + "/" + xmlFile.path;
    
    this.startPolling(xmlFile, svgFile);
    this.openDrawioDesktop(xmlFullPath);
  }

  openDrawioDesktop(xmlPath) {
    const isMac = process.platform === "darwin";
    const isLinux = process.platform === "linux";
    
    let cmd;
    
    if (isMac) {
      const paths = [
        '"/Applications/draw.io.app/Contents/MacOS/draw.io"',
        '"/Applications/Diagrams.net.app/Contents/MacOS/draw.io"',
        'open -a "draw.io"',
        'open -a "Diagrams.net"'
      ];
      
      for (const path of paths) {
        cmd = `${path} "${xmlPath}"`;
        try {
          child_process.execSync(cmd, { stdio: "ignore" });
          return;
        } catch (e) {
          continue;
        }
      }
      
      cmd = `open "https://app.diagrams.net/?embed=1&xml=${encodeURIComponent(xmlPath)}"`;
    } else if (isLinux) {
      cmd = `drawio "${xmlPath}" || diagramsnet "${xmlPath}"`;
    } else {
      const paths = [
        `"${process.env.LOCALAPPDATA}\\draw.io\\draw.io.exe"`,
        `"${process.env.PROGRAMFILES}\\draw.io\\draw.io.exe"`,
        "drawio"
      ];
      
      for (const path of paths) {
        cmd = `${path} "${xmlPath}"`;
        try {
          child_process.execSync(cmd, { stdio: "ignore" });
          return;
        } catch (e) {
          continue;
        }
      }
      
      cmd = `start "" "https://app.diagrams.net/?embed=1&xml=${encodeURIComponent(xmlPath)}"`;
    }

    child_process.exec(cmd, (error) => {
      if (error) {
        console.log("Failed to open Draw.io:", error.message);
      }
    });
  }

  async onunload() {
    for (const [path, interval] of this.pollIntervals) {
      clearInterval(interval);
    }
    this.pollIntervals.clear();
  }
}

module.exports = DrawioIntegration;
