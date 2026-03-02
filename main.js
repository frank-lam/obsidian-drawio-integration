"use strict";
var e = require("obsidian");
var child_process = require("child_process");
var fs = require("fs");

const XML_SUFFIX = ".auto-create-drawio";

const DRAWIO_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="now" agent="Obsidian" version="21.0.0">
  <diagram name="Page-1">
    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="465" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

const SVG_PLACEHOLDER = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225">
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <text x="200" y="112.5" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#666">Click "Edit Drawio" to edit</text>
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
              .onClick(async () => {
                await this.editDrawio(file);
              });
          });

          const xmlPath = file.path.replace(".svg", XML_SUFFIX + ".xml");
          const hasXml = !!this.app.vault.getAbstractFileByPath(xmlPath);
          const xmlFileName = file.basename + XML_SUFFIX + ".xml";
          
          menu.addItem((item) => {
            item
              .setTitle(hasXml ? "Delete Drawio (svg+xml)" : "Delete Drawio (svg only)")
              .setIcon("trash")
              .onClick(async () => {
                if (hasXml) {
                  const msg = `将删除 SVG 和 XML 文件，文件如下：\n- ${file.name}\n- ${xmlFileName}\n\n取消则不删除任何文件。`;
                  const confirmed = confirm(msg);
                  if (!confirmed) return;
                  const xmlFile = this.app.vault.getAbstractFileByPath(xmlPath);
                  if (xmlFile) {
                    await this.app.vault.delete(xmlFile);
                  }
                }

                const svgBaseName = file.basename;
                const allFiles = this.app.vault.getFiles();
                for (const mdFile of allFiles) {
                  if (mdFile.extension === "md") {
                    let content = await this.app.vault.read(mdFile);
                    const originalContent = content;
                    content = content.replace(new RegExp(`!\\[\\]\\([^\\)]*${svgBaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.svg\\)`, 'g'), '');
                    if (content !== originalContent) {
                      await this.app.vault.modify(mdFile, content);
                    }
                  }
                }

                await this.app.vault.delete(file);
              });
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

  startPolling(xmlFile, svgFile) {
    const basePath = this.app.vault.adapter.getBasePath();
    const xmlFullPath = basePath + "/" + xmlFile.path;
    
    if (this.pollIntervals.has(xmlFile.path)) {
      return;
    }

    fs.stat(xmlFullPath, (err, stats) => {
      if (!err && stats) {
        this.lastModifiedTimes.set(xmlFile.path, stats.mtimeMs);
      }
    });

    const interval = setInterval(() => {
      fs.stat(xmlFullPath, async (err, stats) => {
        if (err) {
          clearInterval(interval);
          this.pollIntervals.delete(xmlFile.path);
          return;
        }
        
        const lastTime = this.lastModifiedTimes.get(xmlFile.path) || 0;
        
        if (stats.mtimeMs > lastTime) {
          this.lastModifiedTimes.set(xmlFile.path, stats.mtimeMs);
          await this.updateSvgFromXml(xmlFile, svgFile);
        }
      });
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
      let drawioArgs = [];
      
      if (isMac) {
        drawioCmd = "/Applications/draw.io.app/Contents/MacOS/draw.io";
        drawioArgs = ["-x", "-f", "svg", "-o", svgFullPath, xmlFullPath];
      } else {
        drawioCmd = basePath + "/draw.io.exe";
        drawioArgs = ["-x", "-f", "svg", "-o", svgFullPath, xmlFullPath];
      }

      const child = child_process.spawn(drawioCmd, drawioArgs, {
        detached: true,
        stdio: 'ignore',
        cwd: basePath
      });
      
      child.unref();
      
      await new Promise(resolve => setTimeout(resolve, 500));

      const svgContent = await new Promise((resolve, reject) => {
        fs.readFile(svgFullPath, "utf8", (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
      
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
      let leaves = [];
      if (Array.isArray(this.app.workspace.leaves)) {
        leaves = this.app.workspace.leaves;
      } else if (this.app.workspace.getLeaves) {
        leaves = this.app.workspace.getLeaves();
      }
      
      for (const leaf of leaves) {
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
    if (!assetsFolder || !(assetsFolder instanceof e.TFolder)) {
      try {
        await this.app.vault.createFolder(assetsFolderPath);
      } catch (e) {}
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
    const bkpFullPath = xmlFullPath + ".bkp";
    
    this.startPolling(xmlFile, svgFile);
    this.openDrawioDesktop(xmlFullPath, bkpFullPath);
  }

  openDrawioDesktop(xmlPath, bkpPath) {
    const isMac = process.platform === "darwin";
    const isLinux = process.platform === "linux";
    const fs = require('fs');

    const cleanupBkp = () => {
      if (bkpPath && fs.existsSync(bkpPath)) {
        try {
          fs.unlinkSync(bkpPath);
          console.log("Deleted bkp file:", bkpPath);
        } catch (e) {
          console.error("Failed to delete bkp:", e);
        }
      }
    };

    const runDrawio = async (cmd, args) => {
      return new Promise((resolve) => {
        const child = child_process.spawn(cmd, args, {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        child.on('close', () => {
          cleanupBkp();
          resolve();
        });
      });
    };
    
    (async () => {
      if (isMac) {
        const appPaths = [
          "/Applications/draw.io.app/Contents/MacOS/draw.io",
          "/Applications/Diagrams.net.app/Contents/MacOS/draw.io"
        ];
        
        let success = false;
        for (const appPath of appPaths) {
          if (fs.existsSync(appPath)) {
            try {
              await runDrawio(appPath, [xmlPath]);
              success = true;
              break;
            } catch (e) {
              continue;
            }
          }
        }
        
        if (!success) {
          const cmd = `open "https://app.diagrams.net/?embed=1&xml=${encodeURIComponent(xmlPath)}"`;
          child_process.exec(cmd);
        }
      } else if (isLinux) {
        const cmd = `drawio "${xmlPath}" || diagramsnet "${xmlPath}"`;
        child_process.exec(cmd, cleanupBkp);
      } else {
        const paths = [
          `${process.env.LOCALAPPDATA}\\draw.io\\draw.io.exe`,
          `${process.env.PROGRAMFILES}\\draw.io\\draw.io.exe`,
          "drawio"
        ];
        
        let success = false;
        for (const exePath of paths) {
          if (fs.existsSync(exePath)) {
            try {
              await runDrawio(exePath, [xmlPath]);
              success = true;
              break;
            } catch (e) {
              continue;
            }
          }
        }
        
        if (!success) {
          const cmd = `start "" "https://app.diagrams.net/?embed=1&xml=${encodeURIComponent(xmlPath)}"`;
          child_process.exec(cmd);
        }
      }
    })();
  }

  async onunload() {
    for (const [path, interval] of this.pollIntervals) {
      clearInterval(interval);
    }
    this.pollIntervals.clear();
  }
}

module.exports = DrawioIntegration;
