const _fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const JSZip = require("jszip");

module.exports.SBDL = (function() {
    'use strict';
  
    /**
     * An error where the project cannot be loaded as the desired type, but it is likely that this project is of another format.
     */
    class ProjectFormatError extends Error {
      constructor(message, probableType) {
        super(message + ' (probably a .' + probableType + ')');
        this.probableType = probableType;
      }
    }
  
    const SB_MAGIC = 'ScratchV01';
    const ZIP_MAGIC = 'PK';
  
    const fetchQueue = {
      concurrentRequests: 0,
      maxConcurrentRequests: 30,
      queue: [],
      add(url) {
        return new Promise((resolve, reject) => {
          this.queue.push({ url: url, resolve: resolve, reject: reject });
          if (this.concurrentRequests < this.maxConcurrentRequests) {
            this.processNext();
          }
        });
      },
      processNext() {
        if (this.queue.length === 0) {
          return;
        }
        const request = this.queue.shift();
        this.concurrentRequests++;
        _fetch(request.url)
          .then((r) => {
            this.concurrentRequests--;
            this.processNext();
            request.resolve(r);
          })
          .catch((err) => {
            this.concurrentRequests--;
            this.processNext();
            request.reject(err);
          });
      },
    };
  
    function fetch(url) {
      return fetchQueue.add(url);
    }
  
    // Customizable hooks that can be overridden by other scripts to measure progress.
    const progressHooks = {
      // Indicates a loader has just started
      start() {},
      // Indicates a new task has started.
      newTask() {},
      // Indicates a task has finished
      finishTask() {},
    };
  
    function checkMagic(buffer, magic) {
      const header = new Uint8Array(buffer.slice(0, magic.length));
      for (let i = 0; i < magic.length; i++) {
        if (header[i] !== magic.charCodeAt(i)) {
          return false;
        }
      }
      return true;
    }
  
    // Sorts a list of files in-place.
    function sortFiles(files) {
      files.sort((a, b) => {
        const nameA = a.path;
        const nameB = b.path;
  
        // project.json always the top
        if (nameA === "project.json") {
          return -1;
        } else if (nameB === "project.json") {
          return 1;
        }
  
        const valueA = +nameA.split('.').shift() || 0;
        const valueB = +nameB.split('.').shift() || 0;
  
        if (valueA < valueB) {
          return -1;
        } else if (valueA > valueB) {
          return 1;
        }
  
        // Fallback to just a string compare
        return nameA.localeCompare(nameB);
      });
    }
    
    // Loads a Scratch 1 project
    function loadScratch1Project(id) {
      const PROJECTS_API = 'https://projects.scratch.mit.edu/internalapi/project/$id/get/';
  
      const result = {
        title: id.toString(),
        extension: 'sb',
        // Scratch 1 projects load as buffers because they use a custom format that I don't want to implement.
        // The API only responds with the full file.
        type: 'buffer',
        buffer: null,
      };
  
      return fetch(PROJECTS_API.replace('$id', id))
        .then((data) => data.arrayBuffer())
        .then((buffer) => {
          if (!checkMagic(buffer, SB_MAGIC)) {
            throw new Error('Project is not a valid .sb file (failed magic check)');
          }
          result.buffer = buffer;
          return result;
        });
    }
  
    // Loads a Scratch 2 project
    function loadScratch2Project(id) {
      const PROJECTS_API = 'https://projects.scratch.mit.edu/internalapi/project/$id/get/';
  
      // Scratch 2 projects can either by stored as JSON (project.json) or binary (sb2 file)
      // JSON example: https://scratch.mit.edu/projects/15832807 (most Scratch 2 projects are like this)
      // Binary example: https://scratch.mit.edu/projects/250740608
  
      progressHooks.start();
      progressHooks.newTask();
  
      let blob;
  
      // The fetch routine is rather complicated because we have to determine which type of project we are looking at.
      return fetch(PROJECTS_API.replace('$id', id))
        .then((request) => {
          if (request.status !== 200) {
            throw new Error('Returned status code: ' + request.status);
          }
          return request.blob();
        })
        .then((b) => {
          blob = b;
          return new Promise((resolve, reject) => {
            const fileReader = new FileReader();
            fileReader.onload = () => resolve(fileReader.result);
            fileReader.onerror = () => reject(new Error('Cannot read blob as text'));
            fileReader.readAsText(blob);
          });
        })
        .then((text) => {
          let projectData;
          try {
            projectData = JSON.parse(text);
          } catch (e) {
            return loadScratch2BinaryProject(id, blob);
          }
          return loadScratch2JSONProject(id, projectData);
        })
        .then((result) => {
          progressHooks.finishTask();
          return result;
        });
    }
  
    // Loads a Scratch 2 binary-type project
    function loadScratch2BinaryProject(id, blob) {
      return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => {
          if (!checkMagic(fileReader.result, ZIP_MAGIC)) {
            if (checkMagic(fileReader.result, SB_MAGIC)) {
              reject(new ProjectFormatError('File is not a valid .sb2 (failed magic check)', 'sb'))
            }
            reject(new Error('File is not a valid .sb2 (failed magic check)'));
            return;
          }
          
          resolve({
            title: id.toString(),
            extension: 'sb2',
            type: 'buffer',
            buffer: fileReader.result,
          });
        };
        fileReader.onerror = () => reject(new Error('Cannot read blob as array buffer'));
        fileReader.readAsArrayBuffer(blob);
      });
    }
  
    // Loads a Scratch 2 JSON-type project
    function loadScratch2JSONProject(id, projectData) {
      const ASSETS_API = 'https://cdn.assets.scratch.mit.edu/internalapi/asset/$path/get/';
  
      const IMAGE_EXTENSIONS = [
        'svg',
        'png',
        'jpg',
        'jpeg',
        'bmp'
      ];
      const SOUND_EXTENSIONS = [
        'wav',
        'mp3',
      ];
  
      const result = {
        title: id.toString(),
        extension: 'sb2',
        files: [],
        type: 'zip',
      };
  
      // sb2 files have two ways of storing references to files.
      // In the online editor they use md5 hashes which point to an API destination.
      // In the offline editor they use separate accumulative file IDs for images and sounds.
      // The files served from the Scratch API don't contain the file IDs we need to export a valid .sb2, so we must create those ourselves.
  
      let soundAccumulator = 0;
      let imageAccumulator = 0;
  
      // Gets the md5 and extension of an object.
      function md5Of(thing) {
        // Search for any of the possible md5 attributes, falling back to just stringifying the input.
        return thing.md5 || thing.baseLayerMD5 || thing.penLayerMD5 || thing.toString();
      }
  
      function claimAccumulatedID(extension) {
        if (IMAGE_EXTENSIONS.includes(extension)) {
          return imageAccumulator++;
        } else if (SOUND_EXTENSIONS.includes(extension)) {
          return soundAccumulator++;
        } else {
          throw new Error('unknown extension: ' + extension);
        }
      }
  
      function addAsset(asset) {
        progressHooks.newTask();
  
        const md5 = asset.md5;
        const extension = asset.extension;
        const accumulator = claimAccumulatedID(extension);
        const path = accumulator + '.' + extension;
  
        // Update IDs in all references to match the accumulator
        // Downloaded projects usually use -1 for all of these, but sometimes they exist and are just wrong since we're redoing them all.
        for (const reference of asset.references) {
          if ('baseLayerID' in reference) {
            reference.baseLayerID = accumulator;
          }
          if ('soundID' in reference) {
            reference.soundID = accumulator;
          }
          if ('penLayerID' in reference) {
            reference.penLayerID = accumulator;
          }
        }
  
        return fetch(ASSETS_API.replace('$path', md5))
          .then((request) => request.arrayBuffer())
          .then((buffer) => {
            result.files.push({
              path: path,
              data: buffer,
            });
            progressHooks.finishTask();
          });
      }
  
      // Processes a list of assets
      // Finds and groups duplicate assets.
      function processAssets(assets) {
        // Records a list of all unique asset md5s and stores all references to an asset.
        const hashToAssetMap = Object.create(null);
        const allAssets = [];
  
        for (const data of assets) {
          const md5ext = md5Of(data);
          if (!(md5ext in hashToAssetMap)) {
            const asset = {
              md5: md5ext,
              extension: md5ext.split('.').pop(),
              references: [],
            };
            hashToAssetMap[md5ext] = asset;
            allAssets.push(asset);
          }
          hashToAssetMap[md5ext].references.push(data);
        }
  
        return allAssets;
      }
  
      const children = projectData.children.filter((c) => !c.listName && !c.target);
      const targets = [].concat.apply([], [projectData, children]);
      const costumes = [].concat.apply([], targets.map((c) => c.costumes || []));
      const sounds = [].concat.apply([], targets.map((c) => c.sounds || []));
      const assets = processAssets([].concat.apply([], [costumes, sounds, projectData]));
      return Promise.all(assets.map((a) => addAsset(a)))
        .then(() => {
          // We must add the project JSON at the end because it was probably changed during the loading from updating asset IDs
          result.files.push({path: 'project.json', data: JSON.stringify(projectData)});
          sortFiles(result.files);
          return result;
        });
    }
  
    // Loads a Scratch 3 project
    function loadScratch3Project(id) {
      const PROJECTS_API = 'https://projects.scratch.mit.edu/$id';
      const ASSETS_API = 'https://assets.scratch.mit.edu/internalapi/asset/$path/get/';
  
      const result = {
        title: id.toString(),
        extension: 'sb3',
        files: [],
        type: 'zip',
      };
  
      function addFile(data) {
        progressHooks.newTask();
        const path = data.md5ext || data.assetId + '.' + data.dataFormat;
        return fetch(ASSETS_API.replace('$path', path))
          .then((request) => request.arrayBuffer())
          .then((buffer) => {
            result.files.push({path: path, data: buffer});
            progressHooks.finishTask();
          });
      }
  
      // Removes assets with the same ID
      function dedupeAssets(assets) {
        const result = [];
        const knownIds = new Set();
  
        for (const i of assets) {
          const id = i.md5ext;
          if (knownIds.has(id)) {
            continue;
          }
          knownIds.add(id);
          result.push(i);
        }
  
        return result;
      }
  
      progressHooks.start();
      progressHooks.newTask();
  
      return fetch(PROJECTS_API.replace('$id', id))
        .then((request) => request.json())
        .then((projectData) => {
          if (typeof projectData.objName === 'string') {
            throw new ProjectFormatError('Not a Scratch 3 project (found objName)', 'sb2');
          }
          if (!Array.isArray(projectData.targets)) {
            throw new Error('Not a Scratch 3 project, missing targets');
          }
  
          result.files.push({path: 'project.json', data: JSON.stringify(projectData)});
  
          const targets = projectData.targets;
          const costumes = [].concat.apply([], targets.map((t) => t.costumes || []));
          const sounds = [].concat.apply([], targets.map((t) => t.sounds || []));
          const assets = dedupeAssets([].concat.apply([], [costumes, sounds]));
  
          return Promise.all(assets.map((a) => addFile(a)));
        })
        .then(() => {
          sortFiles(result.files);
          progressHooks.finishTask();
          return result;
        });
    }
  
    // Adds a list of files to a JSZip archive.
    // This is a convenience method to make the library less painful to use. It's not used by SBDL internally.
    // If a 'zip' type result is returned, pass result.files into here to get a Blob out.
    // progressCallback (optional) will be called when the progress changes
    function createArchive(files, progressCallback) {
      const zip = new JSZip();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = file.path;
        const data = file.data;
        zip.file(path, data);
      }
      return zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
      }, function(metadata) {
        if (progressCallback) {
          progressCallback(metadata.percent / 100);
        }
      });
    }
  
    // Loads a project, automatically choses the loader
    function loadProject(id, type) {
      const loaders = {
        sb: loadScratch1Project,
        sb2: loadScratch2Project,
        sb3: loadScratch3Project,
      };
      type = type.toString();
      if (!(type in loaders)) {
        return Promise.reject(new Error('Unknown type: ' + type));
      }
      return loaders[type](id);
    }
  
    return {
      loadScratch1Project: loadScratch1Project,
      loadScratch2Project: loadScratch2Project,
      loadScratch3Project: loadScratch3Project,
      loadProject: loadProject,
      createArchive: createArchive,
      progressHooks: progressHooks,
    };
  }());

module.exports.Packer = (function() {
    'use strict';
  
    // @ts-ignore
    const SBDL = module.exports.SBDL;
    // @ts-ignore
  
    /**
     * A file that represents a script or stylesheet to be included in the packager output.
     * @typedef {Object} PackagerFile
     * @property {'script'|'style'} type The type of file
     * @property {string} src Where to fetch the file from, relative to the forkphorus root
     * @property {boolean} [loaded] Whether the file has been loaded.
     * @property {string} [content] Raw text of the file
     * @property {string[]} [inlineSources] File paths to include with data: URIs
     */
  
    /**
     * A runtime asset to be included in the packager output.
     * @typedef {Object} PackagerAsset
     * @property {string} src Where to fetch the file from, relative to the forkphorus root
     * @property {boolean} [loaded] Whether the file has been loaded.
     * @property {Blob} [blob] Raw binary data of the asset
     * @property {string} [data] Raw binary data the asset in the form of a data: URI
     */
  
    /**
     * Convert a Blob to a data: URI
     * @param {Blob} blob Blob or file to be read
     */
    function readAsURL(blob) {
      return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => {
          const result = /** @type {string} */ (fileReader.result);
          if (result.length === 0) {
            reject(new Error('File could not be read, it may be too large. (length 0)'));
            return;
          }
          resolve(result);
        };
        fileReader.onerror = (e) => {
          reject(new Error('Error reading file'));
        };
        fileReader.readAsDataURL(blob);
      });
    }
  
    /**
     * Create an archive from an SBDL files result
     * @param {*} files
     * @param {Progress} progress
     */
    function createArchive(files, progress) {
      progress.start();
      const zip = new JSZip();
      for (const file of files) {
        const path = file.path;
        const data = file.data;
        zip.file(path, data);
      }
      return zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
      }, (metadata) => {
        progress.setProgress(metadata.percent);
        progress.setCaption(metadata.currentFile);
      }).then((archive) => {
        progress.setProgress(1);
        return archive;
      });
    }
  
    /**
     * Helper class for users to implement progress monitoring.
     */
    class Progress {
      newTask() {}
      endTask() {}
      setProgress(progress) {}
      setCaption(text) {}
      start() {}
    }
  
    /**
     * FileLoader downloads files for use in the packager.
     */
    class FileLoader {
      constructor() {
        this.progress = new Progress();
        /** @type {PackagerFile[]} */
        this.files = [];
        /** @type {PackagerAsset[]} */
        this.assets = [];
        /** @type {string} */
        this.pathPrefix = '../';
      }
  
      /**
       * @param {string} source
       */
      async _loadInlineSource(source) {
        const response = await fetch(this.pathPrefix + source);
        const blob = await response.blob();
        const url = await readAsURL(blob);
        return url;
      }
  
      /**
       * @param {PackagerFile} file
       */
      async _loadFile(file) {
        const response = await fetch(this.pathPrefix + file.src);
        let body = await response.text();
  
        if (file.inlineSources) {
          for (const source of file.inlineSources) {
            const sourceData = await this._loadInlineSource(source);
            // string.replace only does the first occurrence, but a source may appear multiple times in the file
            while (body.includes(source)) {
              body = body.replace(source, sourceData);
            }
          }
        }
  
        file.loaded = true;
        file.content = body;
      }
  
      /**
       * @param {PackagerAsset} asset
       */
      async _loadAsset(asset) {
        const response = await fetch(this.pathPrefix + asset.src);
        const blob = await response.blob();
        const data = await readAsURL(blob);
        asset.loaded = true;
        asset.blob = blob;
        asset.data = data;
      }
  
      /**
       * @param {PackagerFile[]} files
       */
      _concatenateFiles(files) {
        return files.map((i) => i.content).join('\n');
      }
  
      /**
       * Fetch & load any assets that have not yet been loaded.
       */
      async loadMissingAssets() {
        const missingFiles = this.files.filter((i) => !i.loaded);
        const missingAssets = this.assets.filter((i) => !i.loaded);
  
        if (missingFiles.length > 0 || missingAssets.length > 0) {
          this.progress.start();
          await Promise.all([
            ...missingFiles.map((i) => this._loadFile(i)),
            ...missingAssets.map((i) => this._loadAsset(i)),
          ]);
        }
  
        return {
          scripts: this._concatenateFiles(this.files.filter((i) => i.type === 'script')),
          styles: this._concatenateFiles(this.files.filter((i) => i.type === 'style')),
          assets: this.assets,
        };
      }
    }
  
    /**
     * JSZip wrapper.
     */
    class Zipper {
      constructor() {
        this.progress = new Progress();
        this.files = [];
      }
  
      /**
       * Add a file to this zipper.
       * @param {string} name The name of the file
       * @param {string|Blob} data The file's data
       */
      addFile(name, data) {
        this.files.push({ path: name, data });
      }
  
      /**
       * @param {string} html HTML output from a Packager
       */
      zip(html) {
        return createArchive(this.files, this.progress);
      }
    }
  
    /**
     * Converts Scratch projects to HTML.
     */
    class Packager {
      constructor({ fileLoader }) {
        this.fileLoader = fileLoader;
  
        /** Options to be passed to player.setOptions() */
        this.playerOptions = {
          fullscreenPadding: 0,
          fullscreenMode: 'window',
        };
  
        /** Options to be passed to player.addControls(). if null, addControls() is not called. */
        this.controlsOptions = null;
  
        /** Options regarding the loading screen. */
        this.loadingScreenOptions = {
          text: 'forkphorus',
        };
  
        this.projectType = null;
        this.projectData = null;
  
        this.projectAttribution = '';
  
        this.archiveProgress = new Progress();
      }
  
      _resultToBlob(result) {
        switch (result.type) {
          case 'zip': {
            return createArchive(result.files, this.archiveProgress);
          }
          case 'buffer': {
            return new Blob([result.buffer]);
          }
          default: {
            throw new Error('Unknown result type: ' + result.type);
          }
        }
      }
  
      /**
       * @param {string} id
       */
      async _getProjectTypeById(id) {
        const res = await _fetch('https://projects.scratch.mit.edu/' + id);
        if (res.status !== 200) {
          if (res.status === 404) {
            throw new Error('Project does not exist: ' + id);
          }
          throw new Error('Cannot get project, got error code: ' + res.status);
        }
  
        const responseClone = res.clone();
  
        let data;
        try {
          data = await res.json();
        } catch (e) {
          // binary file, try to see if it could be a Scratch 2 project
          const blob = await responseClone.blob();
          try {
            await JSZip.loadAsync(blob);
            // if loadAsync doesn't reject, this is valid zip, and is probably a Scratch 2 project
            return 'sb2';
          } catch (e) {
            // not a zip, probably a .sb
            return 'sb';
          }
        }
  
        if ('targets' in data) return 'sb3';
        if ('objName' in data) return 'sb2';
        throw new Error('Unknown project type');
      }
  
      /**
       * @param {string} id
       */
      async _getProjectById(id) {
        // TODO: don't fetch the project data twice, especially important for binary projects.
        const type = await this._getProjectTypeById(id);
        const result = await SBDL.loadProject(id, type);
        const blob = await this._resultToBlob(result);
        const url = await readAsURL(blob);
        return {
          url: url,
          type: type,
        };
      }
  
      /**
       * Load a project using its ID on scratch.mit.edu
       * @param {string} id The project's ID
       */
      async loadProjectById(id) {
        const { url, type } = await this._getProjectById(id);
        this.projectData = url;
        this.projectType = type;
      }
  
      /**
       * Load a project from a File
       * @param {File} file The file to be read
       */
      async loadProjectFromFile(file) {
        const extension = file.name.split('.').pop();
        const url = await readAsURL(file);
        this.projectType = extension;
        this.projectData = url;
      }
  
      /**
       * Run the packager, and generate a result HTML page. Must be run after one of the load() methods resolves.
       */
      async run() {
        if (!this.projectData) {
          throw new Error(`missing project data (projectData=${this.projectData})`);
        }
        if (!this.projectType) {
          throw new Error(`missing project type (projectType=${this.projectType})`);
        }
  
        const { scripts, styles, assets } = await this.fileLoader.loadMissingAssets();
        const assetManagerData = '{' + assets.map((asset) => `"${asset.src}": "${asset.data}"`).join(', ') + '}';
  
        const body = `<!DOCTYPE html>
  <!-- Generated by the forkphorus packager: https://forkphorus.github.io/packager/ (MIT Licensed) -->
  <html>
    <head>
      <meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'unsafe-inline' 'unsafe-eval' 'self' data: blob:">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
  /* Forkphorus styles... */
  ${styles}
  
  /* Player styles... */
  body {
    background: #000;
    margin: 0;
    overflow: hidden;
  }
  .player {
    position: absolute;
  }
  .splash, .error {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #000;
    display: table;
    color: #fff;
    cursor: default;
  }
  .error {
    display: none;
  }
  .splash > div,
  .error > div {
    display: table-cell;
    height: 100%;
    text-align: center;
    vertical-align: middle;
  }
  .progress {
    width: 80%;
    height: 16px;
    border: 1px solid #fff;
    margin: 0 auto;
  }
  .progress-bar {
    background: #fff;
    width: 10%;
    height: 100%;
  }
  h1 {
    font: 300 72px Helvetica Neue, Helvetica, Arial, sans-serif;
    margin: 0 0 16px;
  }
  p {
    font: 300 24px/1.5 Helvetica Neue, Helvetica, Arial, sans-serif;
    margin: 0;
    color: rgba(255, 255, 255, .6);
  }
  .error a {
    color: #fff;
  }
      </style>
    </head>
    <body>
  
      <div class="player"></div>
      <div class="splash">
        <div>
          ${this.loadingScreenOptions.text ? `<h1>${this.loadingScreenOptions.text}</h1>` : ''}
          <div class="progress">
            <div class="progress-bar"></div>
          </div>
        </div>
      </div>
      <div class="error">
        <div>
          <h1>Internal Error</h1>
          <p class="error-report"></p>
        </div>
      </div>
  
      <script>
  // Forkphorus scripts...
  ${scripts}
  
  // NW.js hook...
  (function() {
    if (typeof nw !== 'undefined') {
      // open links in the browser
      var win = nw.Window.get();
      win.on('new-win-policy', (frame, url, policy) => {
        policy.ignore();
        nw.Shell.openExternal(url);
      });
      // fix the size of the window made by NW.js
      var package = nw.require('package.json');
      if (package.window && package.window.height && package.window.width) {
        win.resizeBy(package.window.width - window.innerWidth, package.window.height - window.innerHeight);
      }
    }
  })();
  
  // Player scripts...
  (function () {
    'use strict';
  
    var splash = document.querySelector('.splash');
    var error = document.querySelector('.error');
    var progressBar = document.querySelector('.progress');
    var progressBarFill = document.querySelector('.progress-bar');
  
    var splash = document.querySelector('.splash');
    var error = document.querySelector('.error');
    var progressBar = document.querySelector('.progress');
    var progressBarFill = document.querySelector('.progress-bar');
  
    var player = new P.player.Player();
    player.setOptions({ theme: 'dark' });
    var errorHandler = new P.player.ErrorHandler(player, {
      container: document.querySelector('.error-report'),
    });
    player.onprogress.subscribe(function(progress) {
      progressBarFill.style.width = (10 + progress * 90) + '%';
    });
    player.onerror.subscribe(function(e) {
      player.exitFullscreen();
      error.style.display = 'table';
    });
    document.querySelector('.player').appendChild(player.root);
  
    document.addEventListener('touchmove', function(e) {
      e.preventDefault();
    }, { passive: false });
  
    P.io.setAssetManager(new class {
      constructor() {
        // Assets...
        this.data = ${assetManagerData};
      }
  
      loadSoundbankFile(src) {
        return this.fetch('soundbank/' + src).then(function(e) { return e.arrayBuffer(); });
      }
  
      loadFont(src) {
        return this.fetch(src).then(function(e) { return e.blob(); });
      }
  
      fetch(u) {
        return fetch(this.data[u]);
      }
    });
  
    // Project type...
    var type = '${this.projectType}';
    // Project data...
    // Attribution Notice: ${this.projectAttribution}
    var project = '${this.projectData}';
  
    // Player options...
    var playerOptions = ${JSON.stringify(this.playerOptions)};
    // Controls options...
    var controlsOptions = ${JSON.stringify(this.controlsOptions)};
  
    player.setOptions(playerOptions);
    if (controlsOptions) {
      player.addControls(controlsOptions);
    }
  
    fetch(project)
      .then(function(request) { return request.arrayBuffer(); })
      .then(function(buffer) { return player.loadProjectFromBuffer(buffer, type); })
      .then(function() {
        player.enterFullscreen();
        splash.style.display = 'none';
      })
      .catch(function(e) {
        player.handleError(e);
      });
  }());
      </script>
    </body>
  </html>`;
        return body;
      }
    }
  
    return {
      FileLoader,
      Zipper,
      Packager,
    };
  }());