"use strict";
var e = require("obsidian");
const pathUtil = require("path");
var child_process = require("child_process");
var fs = require("fs");

const XML_SUFFIX = ".auto-create";

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
  // Minimal Windows draw.io path detector
  detectDrawioPath() {
    try {
      const { execSync } = require("child_process");
      const stdout = execSync("where draw.io.exe", { stdio: "pipe" }).toString();
      const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l);
      for (const line of lines) {
        const p = pathUtil.normalize(line);
        if (fs.existsSync(p)) return p;
      }
    } catch (err) {
      // ignore
    }
    const candidates = [
      pathUtil.normalize(process.env.LOCALAPPDATA + "\\draw.io\\draw.io.exe"),
      pathUtil.normalize(process.env.PROGRAMFILES + "\\draw.io\\draw.io.exe"),
      pathUtil.normalize(process.env["PROGRAMFILES(X86)"] + "\\draw.io\\draw.io.exe")
    ];
    for (const c of candidates) if (c && fs.existsSync(c)) return c;
    return null;
  }
  // (removed duplicate detectDrawioPath)
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

          const xmlPath = file.path.replace(".svg", XML_SUFFIX + ".drawio");
          const hasXml = !!this.app.vault.getAbstractFileByPath(xmlPath);
          const xmlFileName = file.basename + XML_SUFFIX + ".drawio";
          
          menu.addItem((item) => {
            item
              .setTitle(hasXml ? "Delete Drawio (svg + drawio)" : "Delete Drawio (svg only)")
              .setIcon("trash")
              .onClick(async () => {
                if (hasXml) {
                  const msg = `将删除 SVG 和 drawio 文件，文件如下：\n- ${file.name}\n- ${xmlFileName}\n\n取消则不删除任何文件。`;
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
    const newBaseName = svgFile.basename;
    const newPath = svgFile.path;
    
    // Calculate old and new XML paths correctly
    const oldXmlPath = oldPath.replace(/\.svg$/i, XML_SUFFIX + ".drawio");
    const newXmlPath = newPath.replace(/\.svg$/i, XML_SUFFIX + ".drawio");
    
    console.log(`[Drawio] handleSvgRename: oldPath=${oldPath}, newPath=${newPath}`);
    console.log(`[Drawio] handleSvgRename: oldXmlPath=${oldXmlPath}, newXmlPath=${newXmlPath}`);
    
    // Check if target XML file already exists (would cause conflict)
    const newXmlFileExists = this.app.vault.getAbstractFileByPath(newXmlPath);
    if (newXmlFileExists) {
      new e.Notice(`无法重命名: 已存在 ${newBaseName}${XML_SUFFIX}.drawio 文件，请先删除或重命名该文件`);
      console.log(`[Drawio] Conflict: reverting SVG rename via fs`);
      
      // Use filesystem to revert the rename immediately
      try {
        const basePath = this.app.vault.adapter.getBasePath();
        const oldFullPath = basePath + "/" + newPath;
        const newFullPath = basePath + "/" + oldPath;
        fs.renameSync(oldFullPath, newFullPath);
        new e.Notice(`已恢复 SVG 文件名`);
        
        // Also revert markdown references
        const oldFileName = oldPath.split('/').pop();
        const newFileName = newPath.split('/').pop();
        const allFiles = this.app.vault.getFiles();
        for (const mdFile of allFiles) {
          if (mdFile.extension === "md") {
            let content = await this.app.vault.read(mdFile);
            // Replace new filename with old filename in markdown
            content = content.replace(newFileName, oldFileName);
            await this.app.vault.modify(mdFile, content);
          }
        }
        return;
      } catch (err) {
        console.error("恢复SVG文件名失败:", err);
      }
      return;
    }
    
    const oldXmlFile = this.app.vault.getAbstractFileByPath(oldXmlPath);
    const newXmlFile = this.app.vault.getAbstractFileByPath(newXmlPath);
    
    if (oldXmlFile && !newXmlFile) {
      try {
        await this.app.vault.rename(oldXmlFile, newXmlPath);
        new e.Notice(`重命名 XML: ${oldXmlFile.name} → ${newBaseName}${XML_SUFFIX}.drawio`);
      } catch (err) {
        console.error("重命名XML失败:", err);
      }
    } else if (!oldXmlFile) {
      console.log(`[Drawio] Old XML file not found at ${oldXmlPath}`);
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
        const detected = this.detectDrawioPath();
        if (detected) {
          drawioCmd = detected;
        } else {
          drawioCmd = basePath + "/draw.io.exe";
        }
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

      // Wait for file to be fully written before refreshing
      await new Promise(resolve => setTimeout(resolve, 300));
      
      this.refreshSvgView(svgFile);
      
      new e.Notice("SVG updated!");
    } catch (err) {
      console.error("SVG conversion error:", err);
      new e.Notice("SVG update failed: " + err.message);
    }
  }

  refreshSvgView(svgFile) {
    const svgPath = svgFile.path;
    const svgPathNormal = svgPath.replace(/\\/g, '/');
    const svgFileName = svgPath.split('/').pop().replace(/\\/g, '');
    
    // Wait a bit for file system to settle, then refresh
    setTimeout(() => {
      // Find all markdown files that embed this SVG and refresh them
      try {
        const mdFiles = this.app.vault.getMarkdownFiles();
        for (const mdFile of mdFiles) {
          const cache = this.app.metadataCache.getCache(mdFile.path);
          if (cache && cache.embeds) {
            for (const embed of cache.embeds) {
              if (embed.link && embed.link.toLowerCase().includes(svgFileName.toLowerCase())) {
                console.log("Found markdown file embedding SVG:", mdFile.path);
                // Refresh this markdown file's leaves
                const leaves = this.app.workspace.getLeavesOfType(mdFile);
                for (const leaf of leaves) {
                  if (leaf.rebuildView) {
                    try {
                      leaf.rebuildView();
                      console.log("Refreshed leaf for:", mdFile.path);
                    } catch (e) {}
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.log("Error finding embedding files:", e);
      }
      
      // Invalidate metadata cache for this file
      try {
        const cachedMetadata = this.app.metadataCache.getCache(svgPath);
        if (cachedMetadata) {
          this.app.metadataCache.unloadCache(svgPath);
          this.app.metadataCache.trigger(svgPath, 'changed');
          console.log("Invalidated metadata cache for:", svgPath);
        }
      } catch (e) {
        console.log("Metadata cache invalidation error:", e);
      }
      
      // Force reload the file
      try {
        this.app.vault.loadRaw(svgPath).then(() => {
          console.log("Reloaded raw file:", svgPath);
        });
      } catch (e) {
        console.log("Load raw error:", e);
      }
      
      // Method 1: Use activeLeaf.rebuildView() like Refresh Any View plugin
      try {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf && typeof activeLeaf.rebuildView === "function") {
          activeLeaf.rebuildView();
          console.log("Refreshed via activeLeaf.rebuildView()");
        }
      } catch (e) {
        console.log("activeLeaf.rebuildView error:", e);
      }
      
      // Method 2: Refresh all leaves using their rebuildView method
      let leaves = [];
      if (Array.isArray(this.app.workspace.leaves)) {
        leaves = this.app.workspace.leaves;
      } else if (this.app.workspace.getLeaves) {
        leaves = this.app.workspace.getLeaves();
      }
      
      for (const leaf of leaves) {
        if (!leaf) continue;
        
        // Try rebuildView on each leaf
        if (leaf.rebuildView) {
          try {
            leaf.rebuildView();
            console.log("Refreshed leaf via rebuildView");
          } catch (e) {
            // ignore
          }
        }
        
        // Also try view.rebuild if it exists
        if (leaf.view && leaf.view.rebuild) {
          try {
            leaf.view.rebuild();
            console.log("Refreshed view via rebuild");
          } catch (e) {
            // ignore
          }
        }
      }
      
      // Method 3: Refresh individual images by modifying src
      for (const leaf of leaves) {
        if (!leaf || !leaf.containerEl) continue;
        
        const container = leaf.containerEl;
        const images = container.querySelectorAll('img');
        images.forEach(img => {
          try {
            const src = img.getAttribute('src');
            if (src) {
              const decodedSrc = decodeURIComponent(src);
              if (decodedSrc.includes(svgPathNormal) || decodedSrc.includes(svgPath)) {
                const separator = src.includes("?") ? "&" : "?";
                const baseUrl = src.split("?")[0];
                img.src = baseUrl + separator + "v=" + Date.now();
                console.log("Refreshed img src:", img.src);
              }
            }
          } catch (e) {
            // ignore
          }
        });
        
        // Also refresh inline SVGs
        const svgs = container.querySelectorAll('svg');
        svgs.forEach(svg => {
          const dataSrc = svg.getAttribute('data-src') || svg.getAttribute('src');
          if (dataSrc) {
            const decodedSrc = decodeURIComponent(dataSrc);
            if (decodedSrc.includes(svgPathNormal) || decodedSrc.includes(svgPath)) {
              const separator = dataSrc.includes("?") ? "&" : "?";
              const baseUrl = dataSrc.split("?")[0];
              svg.setAttribute('src', baseUrl + separator + "v=" + Date.now());
              svg.setAttribute('data-src', baseUrl + separator + "v=" + Date.now());
              console.log("Refreshed inline svg");
            }
          }
        });
      }
      
      // Method 4: Update workspace options
      try {
        this.app.workspace.updateOptions();
        console.log("Updated workspace options");
      } catch (e) {
        console.log("updateOptions error:", e);
      }
      
      // Method 5: Use iterateAllLeaves like Refresh Any View plugin
      try {
        if (this.app.workspace.iterateAllLeaves) {
          this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf && leaf.view && leaf.view.render) {
              try {
                leaf.view.render();
                console.log("Rendered leaf view");
              } catch (e) {}
            }
            if (leaf && leaf.rebuildView) {
              try {
                leaf.rebuildView();
                console.log("Rebuilt leaf via iterateAllLeaves");
              } catch (e) {}
            }
          });
        }
      } catch (e) {
        console.log("iterateAllLeaves error:", e);
      }
    }, 1000);
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
    const xmlPath = folder.path === "/" ? `/${baseName}${XML_SUFFIX}.drawio` : `${folder.path}/${baseName}${XML_SUFFIX}.drawio`;
    
    await this.app.vault.create(svgPath, SVG_PLACEHOLDER);
    await this.app.vault.create(xmlPath, DRAWIO_TEMPLATE);
    
    new e.Notice(`Created ${baseName}.svg and ${baseName}${XML_SUFFIX}.drawio`);
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
    const xmlPath = `${assetsFolderPath}/${baseName}${XML_SUFFIX}.drawio`;
    
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
    let xmlPath = folder.path === "/" ? `/${baseName}${XML_SUFFIX}.drawio` : `${folder.path}/${baseName}${XML_SUFFIX}.drawio`;
    
    console.log(`[Drawio] editDrawio: svgFile.path=${svgFile.path}, baseName=${baseName}, folder.path=${folder.path}, xmlPath=${xmlPath}`);
    
    let xmlFile = this.app.vault.getAbstractFileByPath(xmlPath);
    
    if (!xmlFile) {
      // Try to find the xml file by scanning vault files
      console.log(`[Drawio] xml not found at ${xmlPath}, scanning vault...`);
      const allFiles = this.app.vault.getFiles();
      const xmlFileName = baseName + ".drawio";
      for (const f of allFiles) {
        if (f.name === xmlFileName && f.extension === "xml") {
          console.log(`[Drawio] Found xml file by name: ${f.path}`);
          xmlFile = f;
          xmlPath = f.path;
          break;
        }
      }
    }
    
    if (!xmlFile) {
      console.log(`[Drawio] Creating xml file at ${xmlPath}`);
      try {
        await this.app.vault.create(xmlPath, DRAWIO_TEMPLATE);
        xmlFile = this.app.vault.getAbstractFileByPath(xmlPath);
      } catch (err) {
        console.error("Error creating xml:", err);
        if (err && (typeof err.message === "string" && err.message.includes("File already exists") || (err.code && err.code === "EEXIST"))) {
          xmlFile = this.app.vault.getAbstractFileByPath(xmlPath);
        }
      }
    }
    
    if (!xmlFile) {
      console.error("[Drawio] Still cannot access xml file!");
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
        // Windows: try auto-detected path first
        const detectedPath = this.detectDrawioPath();
        if (detectedPath) {
          try {
            await runDrawio(detectedPath, [xmlPath]);
            return;
          } catch (e) {
            // fall through to fallback paths
          }
        }

        // Fallback: known locations / PATH
        try {
          const { execSync } = require('child_process');
          const found = execSync('where draw.io.exe', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/)[0];
          if (found && fs.existsSync(found)) {
            await runDrawio(found, [xmlPath]);
            return;
          }
        } catch (e) {
          // ignore
        }

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
