/**
 * Nations of World Launcher
 */

const AdmZip = require('adm-zip');
const async = require('async');
const child_process = require('child_process');
const crypto = require('crypto');
const EventEmitter = require('events');
const fs = require('fs-extra');
const https = require('https');
const http = require('http');
const path = require('path');
const { Readable } = require('stream');
const tar = require('tar-fs');
const zlib = require('zlib');

const ConfigManager = require('./configmanager');
const DistroManager = require('./distromanager');

/**
 * Follow HTTP redirects and return the final response stream.
 */
function httpGetStream(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if(maxRedirects < 0) {
            reject(new Error('Too many redirects'));
            return;
        }
        const mod = new URL(url).protocol === 'https:' ? https : http;
        const req = mod.get(url, (resp) => {
            if(resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
                resp.resume();
                httpGetStream(resp.headers.location, maxRedirects - 1).then(resolve).catch(reject);
                return;
            }
            resolve(resp);
        });
        req.on('error', reject);
    });
}

class Asset {
    constructor(id, hash, size, from, to) {
        this.id = id;
        this.hash = hash;
        this.size = size;
        this.from = from;
        this.to = to;
    }
}

class Library extends Asset {
    static mojangFriendlyOS() {
        const opSys = process.platform;
        if(opSys === 'darwin') {
            return 'osx';
        } 
        else if(opSys === 'win32') {
            return 'windows';
        } 
        else if(opSys === 'linux') {
            return 'linux';
        }
        else {
            return 'unknown_os';
        }
    }

    static validateRules(rules, natives) {
        if(rules == null) {
            if(natives == null) {
                return true
            } 
            else {
                return natives[Library.mojangFriendlyOS()] != null;
            }
        }
        for(let rule of rules) {
            const action = rule.action;
            const osProp = rule.os;
            if(action != null && osProp != null) {
                const osName = osProp.name;
                const osMoj = Library.mojangFriendlyOS();
                if(action === 'allow') {
                    return osName === osMoj;
                } 
                else if(action === 'disallow') {
                    return osName !== osMoj;
                }
            }
        }
        return true;
    }
}

class DistroModule extends Asset {
    constructor(id, hash, size, from, to, type) {
        super(id, hash, size, from, to);
        this.type = type;
    }
}

class DLTracker {
    constructor(dlqueue, dlsize, callback = null) {
        this.dlqueue = dlqueue;
        this.dlsize = dlsize;
        this.callback = callback;
    }
}

class JavaManager extends EventEmitter {
    static javaExecFromRoot(rootDir) {
        if(process.platform === 'win32') {
            return path.join(rootDir, 'bin', 'javaw.exe');
        } 
        else if(process.platform === 'darwin') {
            return path.join(rootDir, 'Contents', 'Home', 'bin', 'java');
        } 
        else if(process.platform === 'linux') {
            return path.join(rootDir, 'bin', 'java');
        }
        return rootDir;
    }

    static isJavaExecPath(pth) {
        if(process.platform === 'win32') {
            return pth.endsWith(path.join('bin', 'javaw.exe'));
        } 
        else if(process.platform === 'darwin') {
            return pth.endsWith(path.join('bin', 'java'));
        } 
        else if(process.platform === 'linux') {
            return pth.endsWith(path.join('bin', 'java'));
        }
        return false;
    }

    static _scanFileSystem(scanDir) {
        return new Promise((resolve, reject) => {
            fs.exists(scanDir, (e) => {
                let res = new Set();
                if(e) {
                    fs.readdir(scanDir, (err, files) => {
                        if(err) {
                            resolve(res);
                            console.log(err);
                        } 
                        else {
                            let pathsDone = 0;
                            for(let i = 0; i < files.length; i++) {
                                const combinedPath = path.join(scanDir, files[i]);
                                const execPath = JavaManager.javaExecFromRoot(combinedPath);

                                fs.exists(execPath, (v) => {
                                    if(v) {
                                        res.add(combinedPath);
                                    }

                                    ++pathsDone;

                                    if(pathsDone === files.length) {
                                        resolve(res);
                                    }
                                });
                            }
                            if(pathsDone === files.length) {
                                resolve(res);
                            }
                        }
                    });
                } 
                else {
                    resolve(res);
                }
            });
        });
    }

    static parseJavaRuntimeVersion(verString) {
        const major = verString.split('.')[0];
        if(major == 1) {
            return JavaManager._parseJavaRuntimeVersion_8(verString);
        }
    }

    static _parseJavaRuntimeVersion_8(verString) {
        // 1.{major}.0_{update}-b{build}
        // ex. 1.8.0_152-b16
        const ret = {};
        let pts = verString.split('-');
        ret.build = parseInt(pts[1].substring(1));
        pts = pts[0].split('_');
        ret.update = parseInt(pts[1]);
        ret.major = parseInt(pts[0].split('.')[1]);
        return ret;
    }

    static _sortValidJavaArray(validArr) {
        const retArr = validArr.sort((a, b) => {
            if(a.version.major === b.version.major) {
                if(a.version.major < 9) {
                    // Java 8
                    if(a.version.update === b.version.update){
                        if(a.version.build === b.version.build){
                            // Same version, give priority to JRE.
                            if(a.execPath.toLowerCase().indexOf('jdk') > -1){
                                return b.execPath.toLowerCase().indexOf('jdk') > -1 ? 0 : 1
                            } 
                            else {
                                return -1
                            }
                        } 
                        else {
                            return a.version.build > b.version.build ? -1 : 1
                        }
                    } 
                    else {
                        return  a.version.update > b.version.update ? -1 : 1
                    }
                }
            }
            else {
                return a.version.major > b.version.major ? -1 : 1
            }
        });
        return retArr
    }

    static _scanJavaHome() {
        const jHome = process.env.JAVA_HOME;
        try {
            let res = fs.existsSync(jHome);
            return res ? jHome : null;
        } 
        catch (err) {
            return null
        }
    }
}

class AssetManager extends EventEmitter {
    constructor(commonPath, javaexec) {
        super();
        this.totaldlsize = 0;
        this.progress = 0;

        this.assets = new DLTracker([], 0);
        this.libraries = new DLTracker([], 0);
        this.files = new DLTracker([], 0);
        this.forge = new DLTracker([], 0);
        this.java = new DLTracker([], 0);

        this.extractQueue = [];
        this.commonPath = commonPath;
        this.javaexec = javaexec;
    }

    static _calculateHash(buf, algo) {
        return crypto.createHash(algo).update(buf).digest('hex');
    }

    static _validateLocal(filePath, algo, hash) {
        if(fs.existsSync(filePath)) {
            // No hash provided, have to assume it's good.
            if(hash == null) {
                return true;
            }
            let buf = fs.readFileSync(filePath);
            let calcdhash = AssetManager._calculateHash(buf, algo);
            return calcdhash === hash;
        }
        return false
    }

    validateDistribution(instance) {
        const self = this;
        return new Promise((resolve, reject) => {
            self.forge = self._parseDistroModules(instance.getModules(), instance.getMinecraftVersion(), instance.getID());
            resolve(instance);
        });
    }

    _parseDistroModules(modules, version, instanceid) {
        let alist = [];
        let asize = 0;
        for(let ob of modules) {
            let obArtifact = ob.getArtifact();
            let obPath = obArtifact.getPath();
            let artifact = new DistroModule(ob.getIdentifier(), obArtifact.getHash(), obArtifact.getSize(), obArtifact.getURL(), obPath, ob.getType());
            const validationPath = obPath.toLowerCase().endsWith('.pack.xz') ? obPath.substring(0, obPath.toLowerCase().lastIndexOf('.pack.xz')) : obPath;
            if(!AssetManager._validateLocal(validationPath, 'MD5', artifact.hash)) {
                asize += artifact.size * 1;
                alist.push(artifact);
                if(validationPath !== obPath) {
                    this.extractQueue.push(obPath);
                }
            }
            // Recursively process the submodules then combine the results.
            if(ob.getSubModules() != null) {
                let dltrack = this._parseDistroModules(ob.getSubModules(), version, instanceid);
                asize += dltrack.dlsize*1;
                alist = alist.concat(dltrack.dlqueue);
            }
        }
        return new DLTracker(alist, asize);
    }

    loadVersionData(version, force = false) {
        const self = this;
        return new Promise(async (resolve, reject) => {
            const versionPath = path.join(self.commonPath, 'versions', version);
            const versionFile = path.join(versionPath, version + '.json');
            if(!fs.existsSync(versionFile) || force) {
                const url = await self._getVersionDataUrl(version);
                //This download will never be tracked as it's essential and trivial.
                console.log('Preparing download of ' + version + ' assets.');
                fs.ensureDirSync(versionPath);
                httpGetStream(url).then(resp => {
                    const stream = resp.pipe(fs.createWriteStream(versionFile));
                    stream.on('finish', () => {
                        resolve(JSON.parse(fs.readFileSync(versionFile)));
                    });
                }).catch(reject);
            } 
            else {
                resolve(JSON.parse(fs.readFileSync(versionFile)));
            }
        });
    }

    _getVersionDataUrl(version) {
        return new Promise((resolve, reject) => {
            fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json')
            .then(response => {
                if(!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(manifest => {
                for(let v of manifest.versions) {
                    if(v.id === version) {
                        resolve(v.url);
                        return;
                    }
                }
                resolve(null);
            })
            .catch(reject);
        });
    }

    validateAssets(versionData, force = false) {
        const self = this;
        return new Promise((resolve, reject) => {
            self._assetChainIndexData(versionData, force).then(() => {
                resolve();
            });
        });
    }

    _assetChainIndexData(versionData, force = false) {
        const self = this;
        return new Promise((resolve, reject) => {
            //Asset index constants.
            const assetIndex = versionData.assetIndex;
            const name = assetIndex.id + '.json';
            const indexPath = path.join(self.commonPath, 'assets', 'indexes');
            const assetIndexLoc = path.join(indexPath, name);

            let data = null;
            if(!fs.existsSync(assetIndexLoc) || force) {
                console.log('Downloading ' + versionData.id + ' asset index.');
                fs.ensureDirSync(indexPath);
                httpGetStream(assetIndex.url).then(resp => {
                    const stream = resp.pipe(fs.createWriteStream(assetIndexLoc));
                    stream.on('finish', () => {
                        data = JSON.parse(fs.readFileSync(assetIndexLoc, 'utf-8'));
                        self._assetChainValidateAssets(versionData, data).then(() => {
                            resolve();
                        });
                    });
                }).catch(reject);
            } 
            else {
                data = JSON.parse(fs.readFileSync(assetIndexLoc, 'utf-8'));
                self._assetChainValidateAssets(versionData, data).then(() => {
                    resolve()
                });
            }
        });
    }

    _assetChainValidateAssets(versionData, indexData) {
        const self = this;
        return new Promise((resolve, reject) => {
            //Asset constants
            const resourceURL = 'https://resources.download.minecraft.net/';
            const localPath = path.join(self.commonPath, 'assets');
            const objectPath = path.join(localPath, 'objects');

            const assetDlQueue = [];
            let dlSize = 0;
            let acc = 0;
            const total = Object.keys(indexData.objects).length;
            //const objKeys = Object.keys(data.objects)
            async.forEachOfLimit(indexData.objects, 10, (value, key, cb) => {
                acc++;
                self.emit('progress', 'assets', acc, total);
                const hash = value.hash;
                const assetName = path.join(hash.substring(0, 2), hash);
                const urlName = hash.substring(0, 2) + '/' + hash;
                const ast = new Asset(key, hash, value.size, resourceURL + urlName, path.join(objectPath, assetName));
                if(!AssetManager._validateLocal(ast.to, 'sha1', ast.hash)) {
                    dlSize += (ast.size*1);
                    assetDlQueue.push(ast);
                }
                cb();
            }, (err) => {
                self.assets = new DLTracker(assetDlQueue, dlSize);
                resolve();
            });
        });
    }

    validateLibraries(versionData) {
        const self = this;
        return new Promise((resolve, reject) => {
            const libArr = versionData.libraries;
            const libPath = path.join(self.commonPath, 'libraries');

            const libDlQueue = [];
            let dlSize = 0;

            //Check validity of each library. If the hashs don't match, download the library.
            async.eachLimit(libArr, 5, (lib, cb) => {
                if(Library.validateRules(lib.rules, lib.natives)) {
                    let artifact = (lib.natives == null) ? lib.downloads.artifact : lib.downloads.classifiers[lib.natives[Library.mojangFriendlyOS()].replace('${arch}', process.arch.replace('x', ''))];
                    const libItm = new Library(lib.name, artifact.sha1, artifact.size, artifact.url, path.join(libPath, artifact.path));
                    if(!AssetManager._validateLocal(libItm.to, 'sha1', libItm.hash)) {
                        dlSize += (libItm.size*1);
                        libDlQueue.push(libItm);
                    }
                }
                cb();
            }, (err) => {
                self.libraries = new DLTracker(libDlQueue, dlSize);
                resolve();
            });
        });
    }

    validateMiscellaneous(versionData) {
        const self = this;
        return new Promise(async (resolve, reject) => {
            await self.validateClient(versionData);
            await self.validateLogConfig(versionData);
            resolve();
        });
    }

    validateClient(versionData, force = false){
        const self = this;
        return new Promise((resolve, reject) => {
            const clientData = versionData.downloads.client;
            const version = versionData.id;
            const targetPath = path.join(self.commonPath, 'versions', version);
            const targetFile = version + '.jar';

            let client = new Asset(version + ' client', clientData.sha1, clientData.size, clientData.url, path.join(targetPath, targetFile));

            if(!AssetManager._validateLocal(client.to, 'sha1', client.hash) || force) {
                self.files.dlqueue.push(client);
                self.files.dlsize += client.size*1;
                resolve();
            } 
            else {
                resolve();
            }
        });
    }

    validateLogConfig(versionData) {
        const self = this;
        return new Promise((resolve, reject) => {
            const client = versionData.logging.client;
            const file = client.file;
            const targetPath = path.join(self.commonPath, 'assets', 'log_configs');

            let logConfig = new Asset(file.id, file.sha1, file.size, file.url, path.join(targetPath, file.id));

            if(!AssetManager._validateLocal(logConfig.to, 'sha1', logConfig.hash)) {
                self.files.dlqueue.push(logConfig);
                self.files.dlsize += logConfig.size*1;
                resolve();
            } 
            else {
                resolve();
            }
        });
    }

    async processDlQueues(identifiers = [{id:'assets', limit:1}, {id:'libraries', limit:1}, {id:'files', limit:1}, {id:'forge', limit:1}]) {
        return new Promise((resolve, reject) => {
            let shouldFire = true;

            // Assign dltracking variables.
            this.totaldlsize = 0;
            this.progress = 0;

            for(let iden of identifiers) {
                this.totaldlsize += this[iden.id].dlsize;
            }

            this.once('complete', (data) => {
                resolve();
            });

            for(let iden of identifiers) {
                let r = this.startAsyncProcess(iden.id, iden.limit);
                if(r) {
                    shouldFire = false;
                }
            }

            if(shouldFire) {
                this.emit('complete', 'download');
            }
        });
    }

    startAsyncProcess(identifier, limit = 1) {
        const self = this;
        const dlTracker = this[identifier];
        const dlQueue = dlTracker.dlqueue;

        if(dlQueue.length > 0) {
            async.eachLimit(dlQueue, limit, (asset, cb) => {
                //console.log(`Download assets : ${asset.id}: ${asset.size}`);
                fs.ensureDirSync(path.join(asset.to, '..'));

                const url = typeof asset.from === 'object' ? asset.from.url : asset.from;

                fetch(url, { redirect: 'follow' }).then(resp => {
                    if(resp.ok) {
                        let doHashCheck = false;
                        const contentLengthHeader = resp.headers.get('content-length');
                        const contentLength = contentLengthHeader != null ? parseInt(contentLengthHeader) : NaN;

                        if(!isNaN(contentLength) && contentLength > 0 && contentLength !== asset.size) {
                            if(asset.size > 0) {
                                // Only warn when we had a known expected size that doesn't match
                                console.log(`WARN: Got ${contentLength} bytes for ${asset.id}: Expected ${asset.size}`);
                                doHashCheck = true;
                            }
                            // Adjust download total in either case (handles unknown/zero size too)
                            this.totaldlsize -= asset.size;
                            this.totaldlsize += contentLength;
                        }

                        if(!resp.body) {
                            console.log(`Failed to download ${asset.id}(${url}). Response body is null.`);
                            self.progress += asset.size*1;
                            self.emit('progress', 'download', self.progress, self.totaldlsize);
                            cb();
                            return;
                        }

                        const nodeReadable = Readable.fromWeb(resp.body);
                        let writeStream = fs.createWriteStream(asset.to);

                        nodeReadable.on('error', (err) => {
                            writeStream.destroy(err);
                        });

                        writeStream.on('close', () => {
                            if(dlTracker.callback != null) {
                                dlTracker.callback.apply(dlTracker, [asset, self]);
                            }

                            if(doHashCheck) {
                                const v = AssetManager._validateLocal(asset.to, asset.type != null ? 'md5' : 'sha1', asset.hash);
                                if(v) {
                                    console.log(`Hashes match for ${asset.id}, byte mismatch is an issue in the distro index.`);
                                } 
                                else {
                                    console.error(`Hashes do not match, ${asset.id} may be corrupted.`);
                                }
                            }
                            cb()
                        });

                        nodeReadable.on('data', (chunk) => {
                            self.progress += chunk.length;
                            self.emit('progress', 'download', self.progress, self.totaldlsize);
                        });

                        nodeReadable.pipe(writeStream);
                    } 
                    else {
                        console.log(`Failed to download ${asset.id}(${url}). Response code ${resp.status}`);
                        self.progress += asset.size*1;
                        self.emit('progress', 'download', self.progress, self.totaldlsize);
                        cb();
                    }
                }).catch(err => {
                    self.emit('error', 'download', err);
                });
            }, (err) => {
                if(err) {
                    console.log('An item in ' + identifier + ' failed to process');
                } 
                else {
                    console.log('All ' + identifier + ' have been processed successfully');
                }

                //self.totaldlsize -= dlTracker.dlsize
                //self.progress -= dlTracker.dlsize
                self[identifier] = new DLTracker([], 0);

                if(self.progress >= self.totaldlsize) {
                    self.emit('complete', 'download');
                }
            });
            return true;
        } 
        else {
            return false;
        }
    }

    loadForgeData(server) {
        const self = this;
        return new Promise(async (resolve, reject) => {
            const modules = server.getModules();
            for(let ob of modules) {
                const type = ob.getType();
                if(type === DistroManager.Types.ForgeHosted || type === DistroManager.Types.Forge) {
                    let obArtifact = ob.getArtifact();
                    let obPath = obArtifact.getPath();
                    let asset = new DistroModule(ob.getIdentifier(), obArtifact.getHash(), obArtifact.getSize(), obArtifact.getURL(), obPath, type);
                    try {
                        let forgeData = await AssetManager._finalizeForgeAsset(asset, self.commonPath);
                        resolve(forgeData);
                    } 
                    catch (err) {
                        reject(err);
                    }
                    return;
                }
            }
            reject('No forge module found!');
        });
    }

    static _finalizeForgeAsset(asset, commonPath) {
        return new Promise((resolve, reject) => {
            fs.readFile(asset.to, (err, data) => {
                if(err) {
                    reject(`Unable to read Forge file: ${err.message}`);
                    return;
                }
                let zip, zipEntries;
                try {
                    zip = new AdmZip(data);
                    zipEntries = zip.getEntries();
                } catch(e) {
                    reject(`Unable to open Forge archive (file may be corrupted): ${e.message}`);
                    return;
                }

                for(let i = 0; i < zipEntries.length; i++) {
                    if(zipEntries[i].entryName === 'version.json') {
                        const forgeVersion = JSON.parse(zip.readAsText(zipEntries[i]));
                        const versionPath = path.join(commonPath, 'versions', forgeVersion.id);
                        const versionFile = path.join(versionPath, forgeVersion.id + '.json');
                        if(!fs.existsSync(versionFile)) {
                            fs.ensureDirSync(versionPath);
                            fs.writeFileSync(path.join(versionPath, forgeVersion.id + '.json'), zipEntries[i].getData());
                            resolve(forgeVersion);
                        } 
                        else {
                            //Read the saved file to allow for user modifications.
                            resolve(JSON.parse(fs.readFileSync(versionFile, 'utf-8')));
                        }
                        return;
                    }
                }
                //We didn't find forge's version.json.
                reject('Unable to finalize Forge processing, version.json not found! Has forge changed their format?');
            })
        })
    }

    async validateEverything(instanceid) {
        try {
            if(!ConfigManager.isLoaded()){
                ConfigManager.load()
            }

            const distro = await DistroManager.pullRemote(ConfigManager.getDistroURL());
            const instance = distro.getInstance(instanceid);

            await this.validateDistribution(instance);
            this.emit('validate', 'distribution');

            const versionData = await this.loadVersionData(instance.getMinecraftVersion());
            this.emit('validate', 'version');

            await this.validateAssets(versionData);
            this.emit('validate', 'assets');
            
            await this.validateLibraries(versionData);
            this.emit('validate', 'libraries');

            await this.validateMiscellaneous(versionData);
            this.emit('validate', 'files');

            await this.processDlQueues();
            const forgeData = await this.loadForgeData(instance);

            return {
                versionData,
                forgeData
            }
        }
        catch (err) {
            console.log("err: ", err);
            return {
                error: err
            }
        }
    }

    validateLocalJavaDownload(javaData) {
        const self = this;
        return new Promise((resolve, reject) => {
            const targetPath = path.join(ConfigManager.getWorkingDirectory(), 'runtime', 'x64');
            const isZip = javaData.url.toLowerCase().endsWith('.zip');
            const targetFile = isZip ? 'runtime.zip' : 'runtime.tar.gz';
            const dlSize = javaData.size != null ? javaData.size : 0;
            const dlHash = javaData.MD5 != null ? javaData.MD5 : null;

            let jre = new Asset('java', dlHash, dlSize, javaData.url, path.join(targetPath, targetFile));

            this.java = new DLTracker([jre], dlSize, (a, self) => {
                if(isZip) {
                    try {
                        const zip = new AdmZip(a.to);
                        const entries = zip.getEntries();
                        let h = null;
                        if(entries.length > 0) {
                            h = entries[0].entryName;
                        }
                        zip.extractAllTo(targetPath, true);
                        fs.unlink(a.to, err => {
                            if(err) {
                                console.log(err);
                            }
                            if(h != null && h.indexOf('/') > -1) {
                                h = h.substring(0, h.indexOf('/'));
                            }
                            else if(h != null && h.indexOf('\\') > -1) {
                                h = h.substring(0, h.indexOf('\\'));
                            }
                            if(h != null) {
                                const pos = path.join(targetPath, h);
                                self.emit('complete', 'java', JavaManager.javaExecFromRoot(pos));
                            }
                        });
                    }
                    catch(err) {
                        console.log(err);
                    }
                }
                else {
                    let h = null
                    fs.createReadStream(a.to)
                        .on('error', err => console.log(err))
                        .pipe(zlib.createGunzip())
                        .on('error', err => console.log(err))
                        .pipe(tar.extract(targetPath, {
                            map: (header) => {
                                if(h == null) {
                                    h = header.name;
                                }
                            }
                        }))
                        .on('error', err => console.log(err))
                        .on('finish', () => {
                            fs.unlink(a.to, err => {
                                if(err) {
                                    console.log(err);
                                }
                                if(h != null && h.indexOf('/') > -1) {
                                    h = h.substring(0, h.indexOf('/'));
                                }
                                else if(h != null && h.indexOf('\\') > -1) {
                                    h = h.substring(0, h.indexOf('\\'));
                                }

                                if(h != null) {
                                    const pos = path.join(targetPath, h);
                                    self.emit('complete', 'java', JavaManager.javaExecFromRoot(pos));
                                }
                            });
                        });
                }
            });
            resolve();
        });
    }

    _validateJVMProperties(stderr) {
        const res = stderr;
        const props = res.split('\n');

        const goal = 2;
        let checksum = 0;

        const meta = {};

        for(let i = 0; i < props.length; i++) {
            if(props[i].indexOf('sun.arch.data.model') > -1) {
                let arch = props[i].split('=')[1].trim();
                arch = parseInt(arch);
                if(arch === 64) {
                    meta.arch = arch;
                    ++checksum;
                    if(checksum === goal) {
                        break;
                    }
                }
            } 
            else if(props[i].indexOf('java.runtime.version') > -1) {
                let verString = props[i].split('=')[1].trim();
                const verOb = JavaManager.parseJavaRuntimeVersion(verString);
                if(verOb.major < 9) {
                    // Java 8
                    if(verOb.major === 8 && verOb.update >= 51) {
                        meta.version = verOb;
                        ++checksum;
                        if(checksum === goal) {
                            break;
                        }
                    }
                }
            }
        }
        meta.valid = checksum === goal;
        return meta;
    }

    _validateJavaBinary(binaryExecPath) {
        return new Promise((resolve, reject) => {
            if(!JavaManager.isJavaExecPath(binaryExecPath)) {
                resolve({valid: false});
            } 
            else if(fs.existsSync(binaryExecPath)) {
                child_process.exec('"' + binaryExecPath + '" -XshowSettings:properties', (err, stdout, stderr) => {
                    try {
                        // Output is stored in stderr?
                        resolve(this._validateJVMProperties(stderr));
                    } 
                    catch (err) {
                        // Output format might have changed, validation cannot be completed.
                        resolve({valid: false});
                    }
                })
            } 
            else {
                resolve({valid: false});
            }
        });
    }

    async _validateJavaRootSet(rootSet) {
        const rootArr = Array.from(rootSet);
        const validArr = []

        for(let i = 0; i < rootArr.length; i++) {
            const execPath = JavaManager.javaExecFromRoot(rootArr[i]);
            const metaOb = await this._validateJavaBinary(execPath);
            if(metaOb.valid) {
                metaOb.execPath = execPath;
                validArr.push(metaOb);
            }
        }
        return validArr;
    }

    async _win32JavaValidate(workingDir) {
        const pathSet1 = await JavaManager._scanFileSystem('C:\\Program Files\\Java');
        const pathSet2 = await JavaManager._scanFileSystem(path.join(workingDir, 'runtime', 'x64'));

        const homeSet = new Set([...pathSet1, ...pathSet2]);

        // Validate JAVA_HOME.
        const jHome = JavaManager._scanJavaHome();
        if(jHome != null && jHome.indexOf('(x86)') === -1) {
            homeSet.add(jHome);
        }

        let pathArr = await this._validateJavaRootSet(homeSet);
        
        if(pathArr.length > 0) {
            return pathArr[0].execPath;
        } 
        else {
            return null;
        }
    }

    async _darwinJavaValidate(workingDir) {
        // Soon update (After Beta windows)
    }

    async _linuxJavaValidate(workingDir) {
        // Soon update (After Beta windows)
    }

    async validateLocalJava(workingDir) {
        return await this['_' + process.platform + 'JavaValidate'](workingDir);
    }

    async validateJava(workingDir) {
        if(!ConfigManager.isLoaded()){
            ConfigManager.load()
        }

        try {
            const distro = await DistroManager.pullRemote(ConfigManager.getDistroURL());
            const javaData = distro.getJava()[Library.mojangFriendlyOS()];

            const javaPath = await this.validateLocalJava(ConfigManager.getWorkingDirectory());
            
            if(javaPath == null) {
                await this.validateLocalJavaDownload(javaData);
            }
            return javaPath;
        }
        catch (err) {
            console.log("err: ", err);
            return {
                error: err
            }
        }
    }
}

module.exports = {
    JavaManager,
    AssetManager,
    Asset,
    Library
}