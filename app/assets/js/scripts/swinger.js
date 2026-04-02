/**
 * Nations of World Launcher
 */

const $ = require('jquery');
const {ipcRenderer, shell, webFrame} = require('electron');
const remote = require('@electron/remote');
const request = require('request');
const cp = require('child_process');
const path = require('path');

const isDev = require('./assets/js/isdev');
const LoggerUtil = require('./assets/js/loggerutil');
const { Library, AssetManager } = require('./assets/js/assetmanager');
const ConfigManager = require('./assets/js/configmanager');
const DistroManager = require('./assets/js/distromanager');
const AuthManager = require('./assets/js/authmanager');

const loggerLauncher = LoggerUtil('%c[Launcher]', 'color: #000668; font-weight: bold');
const loggerSwinger = LoggerUtil('%c[Swinger]', 'color: #000668; font-weight: bold');
const loggerAutoUpdater = LoggerUtil('%c[AutoUpdater]', 'color: #209b07; font-weight: bold');

const launcherVersion = "1.0.0";

loggerLauncher.log('Nations of World (v' + launcherVersion + ") started on " + Library.mojangFriendlyOS() + "..");

// Log deprecation and process warnings.
process.traceProcessWarnings = true;
process.traceDeprecation = true;

// Disable eval function.
// eslint-disable-next-line
window.eval = global.eval = function () {
    throw new Error('Sorry, this app does not support window.eval().');
}

// Display warning when devtools window is opened.
remote.getCurrentWebContents().on('devtools-opened', () => {
    console.log('%cConsole', 'color: #ff8326; font-size: 30px; font-weight: bold');
    console.log('%cBienvenue sur la console !', 'font-size: 16px');
    console.log('%cSi tu fais une capture d\'écran ou un copier-coller pour de l\'aide (support-launcher), fait attention à masquer certaines informations qui s\'affiche ici !', 'font-size: 16px');
});

// Disable zoom, needed for darwin.
webFrame.setZoomLevel(0);
webFrame.setVisualZoomLevelLimits(1, 1);

$(function() {
    loggerSwinger.log('JQuery Initialized.');
    initSwinger();
})

function initSwinger() {
    loggerSwinger.log('Swinger Initializing..');

    showLoading();
    setLoadingStatut("Chargement des éléments de l'interface");

    frameEvent();
    bindRangeSlider();
}

// Init Launcher Functions
// #region

document.addEventListener('readystatechange', function() {
    if(document.readyState === 'complete') {
        if(process.platform != 'win32') { // TODO : Phase Beta (Only Windows)
            setOverlayContent('Système d\'exploitation non pris en charge',
            'Pendant la phase de beta du launcher, seul Windows est pris en charge.',
            'Fermer le launcher');
            toggleOverlay(true);
            setCloseHandler(() => {
                closeLauncher();
            });
        }
        else {
            initLauncher();
        }
    }
}, false);

function initLauncher() {
    setLoadingStatut('Connexion en cours');

    DistroManager.pullRemote(ConfigManager.getDistroURL()).then((data) => {
        loggerLauncher.log('Loaded distribution index.');
        onDistroLoad(data);
    }).catch((err) => {
        loggerLauncher.log('Failed to load distribution index.');
        loggerLauncher.error(err);

        setOverlayContent('Impossible de se connecter au serveur 😭',
            'Merci de vérifier votre connexion à internet ou votre proxy si vous en utilisez un.'
            + '<br><br>URL actuelle : <span style="color: #ff8326; word-break: break-all;">' + ConfigManager.getDistroURL() + '</span>',
            'Fermer le launcher', 'Modifier l\'URL', 15, 'Tentative de reconnexion dans');
        toggleOverlay(true);
        setCloseHandler(() => {
            closeLauncher();
        });
        setActionHandler(() => {
            toggleOverlay(false);
            showDistroURLPrompt();
        });
        setTimeout(function() {
            toggleOverlay(false);
            initLauncher();
        }, 15000);
    });
}

function showDistroURLPrompt() {
    const currentURL = ConfigManager.getDistroURL();
    const newURL = prompt('Entrez l\'URL de distribution :', currentURL);
    if(newURL != null && newURL.trim() !== '') {
        const trimmed = newURL.trim();
        if(trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            ConfigManager.setDistroCustom('true');
            ConfigManager.setDistroURL(trimmed);
            ConfigManager.save();
            loggerLauncher.log('Distribution URL changed to: ' + trimmed);
            initLauncher();
        } else {
            loggerLauncher.log('Invalid URL format, must start with http:// or https://');
            initLauncher();
        }
    }
}

function parseLauncherVersion(verString) {
    const ret = {};
    let pts = verString.split('-');
    ret.build = parseInt(pts[1].substring(1));
    pts = pts[0].split('.');
    ret.update = parseInt(pts[2]);
    ret.minor = parseInt(pts[1]);
    ret.major = parseInt(pts[0]);
    return ret;
}

function onDistroLoad(data) {
    if(data != null) {
        if(ConfigManager.getSelectedInstance() == null || data.getInstance(ConfigManager.getSelectedInstance()) == null) {
            loggerLauncher.log('Determining default selected instance..');
            ConfigManager.setSelectedInstance(data.getMainInstance().getID());
            ConfigManager.save();
        }
    }

    if(data.getMaintenance().enabled) {
        setOverlayContent('Maintenance du launcher',
            data.getMaintenance().message,
            'Fermer le launcher', null, 30, 'Tentative de reconnexion dans');
        toggleOverlay(true);

        setCloseHandler(() => {
            closeLauncher();
        });

        setTimeout(function() {
            toggleOverlay(false);
            initLauncher();
        }, 30000);
        return;
    }

    let forceUpdate = false;
    var versionMin = parseLauncherVersion(data.getVersionMinimum());
    var version = parseLauncherVersion(launcherVersion);
    if((version.build < versionMin.build) || (version.update < versionMin.update) || (version.minor < versionMin.minor) || (version.major < versionMin.major)) {
        forceUpdate = true;
    }

    ipcRenderer.on('autoUpdateNotification', (event, arg, info) => {
        switch(arg) {
            case 'checking-for-update': {
                loggerAutoUpdater.log('Checking for update..');
                setLoadingStatut('Recherche de mise à jour');
                break;
            }
            case 'update-available': {
                loggerAutoUpdater.log('New update available:', info.version);

                if(!forceUpdate) {
                    setOverlayContent('Mise à jour du launcher disponible 😘',
                        'Une nouvelle mise à jour pour le launcher est disponible.' 
                        + '<br>Voulez-vous l\'installer maintenant ?',
                        'Plus tard', 'Télécharger');
                    toggleOverlay(true);
                    setCloseHandler(() => {
                        toggleOverlay(false);
                        onAutoUpdateFinish();
                    });
                    setActionHandler(() => {
                        toggleOverlay(false);
                        setLoadingStatut('Préparation de la mise à jour (peut prendre un moment)');
                        ipcRenderer.send('autoUpdateAction', 'downloadUpdate');
                    });
                }
                else {
                    if(process.platform != 'linux') {
                        setOverlayContent('Mise à jour du launcher disponible 😘',
                            'Une nouvelle mise à jour pour le launcher est disponible.' 
                            + '<br>Voulez-vous l\'installer maintenant ?'
                            + '<br><br><i class="fas fa-chevron-right"></i> Cette mise à niveau est obligatoire pour pouvoir continuer.',
                            'Fermer le launcher', 'Télécharger');
                        toggleOverlay(true);
                        setCloseHandler(() => {
                            toggleOverlay(false);
                            closeLauncher();
                        });
                        setActionHandler(() => {
                            toggleOverlay(false);
                            setLoadingStatut('Préparation de la mise à jour (peut prendre un moment)');
                            ipcRenderer.send('autoUpdateAction', 'downloadUpdate');
                        });
                    }
                    else {
                        console.log("Linux!");
                    }
                }
                break;
            }
            case 'update-not-available': {
                if((version.build < versionMin.build) || (version.update < versionMin.update) || (version.minor < versionMin.minor) || (version.major < versionMin.major)) {
                    setOverlayContent('Launcher obselète',
                            'Votre launcher est obselète !' 
                            + '<br><br><i class="fas fa-chevron-right"></i> Merci de télécharger le launcher sur le site officiel de Paladium.',
                            'Fermer le launcher');
                        toggleOverlay(true);
                        setCloseHandler(() => {
                            closeLauncher();
                        });
                    return;
                }
                else {
                    onAutoUpdateFinish();
                }
                break;
            }
            case 'download-progress': {
                setLoadingStatut('Mise à jour en cours (' + Math.round(info.percent) + "%)");
                break;
            }
            case 'update-downloaded': {
                loggerAutoUpdater.log('Update ' + info.version + ' ready to be installed.');

                setOverlayContent('La mise à jour est prêt à être installé 😁',
                    'Cliquer sur installer pour lancer l\'installation de ma mise à jour du launcher.',
                    'Plus tard (Ferme le launcher)', 'Installer');
                toggleOverlay(true);
                setCloseHandler(() => {
                    closeLauncher();
                });
                setActionHandler(() => {
                    toggleOverlay(false);
                    ipcRenderer.send('autoUpdateAction', 'installUpdateNow');
                });
                break;
            }
            case 'ready': {
                ipcRenderer.send('autoUpdateAction', 'checkForUpdate');
                break;
            }
            case 'realerror': {
                if(info != null && info.code != null) {
                    if(info.code === 'ERR_UPDATER_INVALID_RELEASE_FEED') {
                        loggerAutoUpdater.log('No suitable releases found.');
                    } 
                    else if(info.code === 'ERR_XML_MISSED_ELEMENT') {
                        loggerAutoUpdater.log('No releases found.');
                    } 
                    else {
                        loggerAutoUpdater.error('Error during update check..', info);
                        loggerAutoUpdater.debug('Error Code:', info.code);
                    }

                    setOverlayContent('Impossible de se connecter au serveur 😭',
                        'Merci de vérifier votre connexion à internet ou votre proxy si vous en utilisez un.',
                        'Fermer le launcher', 'Réessayer');
                    toggleOverlay(true);
                    setCloseHandler(() => {
                        closeLauncher();
                    });
                    setActionHandler(() => {
                        toggleOverlay(false);
                        ipcRenderer.send('autoUpdateAction', 'initAutoUpdater');
                    });
                }
                break;
            }
            default: {
                loggerAutoUpdater.log('Unknown argument', arg);
                break;
            }
        }
    });

    if(!isDev) {
        ipcRenderer.send('autoUpdateAction', 'initAutoUpdater');
    }
    else { // Dev Mod
        onAutoUpdateFinish();
    }
}

function onAutoUpdateFinish() {
    setLoadingStatut("Vérification de l'environnement Java");

    const jExe = ConfigManager.getJavaExecutable();
    if(jExe == null) {
        downloadJava();
    }
    else {
        const jm = new AssetManager();
        jm._validateJavaBinary(jExe).then((v) => {
            loggerLauncher.log('Java version meta', v);
            if(v.valid) {
                onValidateJava();
            } 
            else {
                downloadJava();
            }
        });
    }
}

function downloadJava() {
    const loggerJavaAssetEx = LoggerUtil('%c[JavaManagerEx]', 'color: #353232; font-weight: bold');

    let javaAssetEx = cp.fork(path.join(__dirname, 'assets', 'js', 'assetmanagerexec.js'), [
        'AssetManager',
        ConfigManager.getCommonDirectory(),
        ConfigManager.getJavaExecutable()
    ], {
        stdio: 'pipe'
    });

    // Stdout
    javaAssetEx.stdio[1].setEncoding('utf8');
    javaAssetEx.stdio[1].on('data', (data) => {
        loggerJavaAssetEx.log(data);
    });
    // Stderr
    javaAssetEx.stdio[2].setEncoding('utf8');
    javaAssetEx.stdio[2].on('data', (data) => {
        loggerJavaAssetEx.log(data);
    });

    javaAssetEx.on('message', (m) => {
        if(m.context === 'validateJava') {
            if(m.result == null) {
                setLoadingStatut("Téléchargement de Java en cours");
                javaAssetEx.send({task: 'execute', function: 'processDlQueues', argsArr: [[{id:'java', limit:1}]]});
            }
            else {
                ConfigManager.setJavaExecutable(m.result);
                ConfigManager.save();

                javaAssetEx.disconnect();
                onValidateJava();
            }
        }
        else if(m.context === 'progress') {
            switch(m.data) {
                case 'download': {
                    setLoadingStatut("Téléchargement de Java en cours (" + m.percent + "%)");
                    break;
                }
            }
        }
        else if(m.context === 'complete') {
            switch(m.data) {
                case 'download': {
                    setLoadingStatut("Extraction en cours");
                    break;
                }
                case 'java': {
                    ConfigManager.setJavaExecutable(m.args[0]);
                    ConfigManager.save();

                    javaAssetEx.disconnect();
                    onValidateJava();
                    break;
                }
            }
        }
        else if(m.context === 'error') {
            setOverlayContent('Le téléchargement à échoué 😭',
                'Une erreur c\'est produite lors du téléchargement de Java.'
                + '<br>Nous vous conseillons de réessayer avec le bouton ci-dessous.', 
                'Fermer le launcher', 'Réessayer');
            toggleOverlay(true);

            setCloseHandler();
            setActionHandler(() => {
                toggleOverlay(false);
                javaAssetEx.send({task: 'execute', function: 'processDlQueues', argsArr: [[{id:'java', limit:1}]]});
            });
        }
    });
    javaAssetEx.send({task: 'execute', function: 'validateJava', argsArr: [ConfigManager.getWorkingDirectory()]});
}

function onValidateJava() {
    setLoadingStatut("Chargement en cours");
    hideLoading();

    const isLoggedIn = Object.keys(ConfigManager.getAuthAccounts()).length > 0;
    if(isLoggedIn) {
        validateSelectedAccount();
        showMainUI(VIEWS.launcher);
        initLauncherView();
    }
    else {
        showMainUI(VIEWS.login);
    }
}

async function validateSelectedAccount() {
    const selectedAcc = ConfigManager.getSelectedAccount();
    if(selectedAcc != null) {
        const val = await AuthManager.validateSelected();
        if(!val) {
            ConfigManager.removeAuthAccount(selectedAcc.uuid);
            ConfigManager.save();
        }
    }
}

// #endregion

/**
 * Swinger 
 */

// #region

document.addEventListener('keydown', function (e) {
    if((e.key === 'I' || e.key === 'i') && e.ctrlKey && e.shiftKey) {
        let window = remote.getCurrentWindow();
        window.toggleDevTools({mode:'undocked'});
    }
    else if(isDev && (e.key === 'R' || e.key === 'r')) {
        let window = remote.getCurrentWindow();
        window.reload();
    }
});

$(document).on('click', 'a[href^="http"]', function(event) {
    event.preventDefault();
    shell.openExternal(this.href);
});

function frameEvent() {
    $("#frame-button-close").click(function() {
        closeLauncher();
    });

    $("#frame-button-restoredown").click(function() {
        const window = remote.getCurrentWindow();
        if(window.isMaximized()) {
            window.unmaximize();
        } 
        else {
            window.maximize();
        }
        document.activeElement.blur();
    });

    $("#frame-button-minimize").click(function() {
        const window = remote.getCurrentWindow();
        window.minimize();
        document.activeElement.blur();
    });
}

function closeLauncher() {
    const window = remote.getCurrentWindow();
    window.close();
}

// Slider Functions
// #region

function bindRangeSlider() {
    Array.from(document.getElementsByClassName('range-slider')).map((v) => {
        const track = v.getElementsByClassName('range-slider-track')[0];

        const value = v.getAttribute('value');
        const sliderMeta = calculateRangeSliderMeta(v);

        updateRangedSlider(v, value, ((value-sliderMeta.min) / sliderMeta.step) * sliderMeta.inc);

        track.onmousedown = (e) => {
            document.onmouseup = (e) => {
                document.onmousemove = null;
                document.onmouseup = null;
            }

            document.onmousemove = (e) => {
                const diff = e.pageX - v.offsetLeft - track.offsetWidth / 2;
                if(diff >= 0 && diff <= v.offsetWidth-track.offsetWidth / 2) {
                    const perc = (diff / v.offsetWidth) * 100;
                    const notch = Number(perc / sliderMeta.inc).toFixed(0) * sliderMeta.inc
                    if(Math.abs(perc-notch) < sliderMeta.inc / 2) {
                        updateRangedSlider(v, sliderMeta.min + (sliderMeta.step * (notch / sliderMeta.inc)), notch);
                    }
                }
            }
        }
    });
}

function calculateRangeSliderMeta(v) {
    const val = {
        max: Number(v.getAttribute('max')),
        min: Number(v.getAttribute('min')),
        step: Number(v.getAttribute('step')),
    }
    val.ticks = (val.max-val.min) / val.step;
    val.inc = 100 / val.ticks;
    return val;
}

function updateRangedSlider(element, value, notch) {
    const oldVal = element.getAttribute('value');
    const bar = element.getElementsByClassName('range-slider-bar')[0];
    const track = element.getElementsByClassName('range-slider-track')[0];
    
    element.setAttribute('value', value);

    if(notch < 0) {
        notch = 0;
    } 
    else if(notch > 100) {
        notch = 100;
    }

    const event = new MouseEvent('change', {
        target: element,
        type: 'change',
        bubbles: false,
        cancelable: true
    });

    let cancelled = !element.dispatchEvent(event);
    if(!cancelled) {
        track.style.left = notch + '%';
        bar.style.width = notch + '%';
    }
    else {
        element.setAttribute('value', oldVal);
    }
}

// #endregion

// #endregion

// Loading panel Functions
// #region

function showLoading() {
    var splashes = [{text: "Chargement du menu de chargement", author: "Chaika9"}, {text: "Char...ge...ment en courssssss.....", author: "Chaika9"}, {text: "#On aime les chargements", author: "Chaika9"}];

    var splashe_text = splashes[Math.floor(Math.random()*splashes.length)];
    $("#loading-splash-text").html(splashe_text.text);
    $("#loading-sudmitted-author").html('@' + splashe_text.author);

    var matrix = [];
    var line1 = ["none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "a62102", "a62102", "a62102"];
    var line2 = ["none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "a62102", "fa9608", "f5d44f", "a62102"];
    var line3 = ["none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "a62102", "fa9608", "f5d44f", "fa9608", "a62102"];
    var line4 = ["none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "a62102", "fa9608", "f5d44f", "fa9608", "a62102", "none"];
    var line5 = ["none", "none", "none", "none", "080808", "none", "none", "none", "none", "a62102", "fa9608", "f5d44f", "fa9608", "a62102", "none", "none"];
    var line6 = ["none", "none", "none", "080808", "080808", "none", "none", "a62102", "a62102", "fa9608", "f5d44f", "fa9608", "a62102", "none", "none", "none"];
    var line7 = ["none", "none", "080808", "080808", "080808", "none", "a62102", "fa9608", "fa9608", "f5d44f", "fa9608", "a62102", "none", "none", "none", "none"];
    var line8 = ["none", "none", "080808", "3b3837", "080808", "none", "a62102", "fa9608", "f5d44f", "fa9608", "a62102", "none", "none", "none", "none", "none"];
    var line9 = ["none", "none", "none", "080808", "3b3837", "a62102", "fa9608", "f5d44f", "fa9608", "fa9608", "a62102", "none", "none", "none", "none", "none"];
    var line10 = ["none", "none", "080808", "3b3837", "080808", "080808", "080808", "fa9608", "a62102", "a62102", "none", "none", "none", "none", "none", "none"];
    var line11 = ["none", "none", "080808", "3b3837", "080808", "6b6767", "080808", "a62102", "none", "none", "none", "none", "none", "none", "none", "none"];
    var line12 = ["none", "none", "none", "080808", "6b6767", "080808", "080808", "3b3837", "080808", "080808", "080808", "080808", "none", "none", "none", "none"];
    var line13 = ["none", "none", "3b3837", "6b6767", "080808", "3b3837", "3b3837", "080808", "3b3837", "080808", "080808", "none", "none", "none", "none", "none"];
    var line14 = ["080808", "080808", "6b6767", "3b3837", "none", "080808", "080808", "none", "080808", "080808", "none", "none", "none", "none", "none", "none"];
    var line15 = ["080808", "ff0600", "080808", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none"];
    var line16 = ["080808", "080808", "080808", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none"];

    matrix.push(line1);
    matrix.push(line2);
    matrix.push(line3);
    matrix.push(line4);
    matrix.push(line5);
    matrix.push(line6);
    matrix.push(line7);
    matrix.push(line8);
    matrix.push(line9);
    matrix.push(line10);
    matrix.push(line11);
    matrix.push(line12);
    matrix.push(line13);
    matrix.push(line14);
    matrix.push(line15);
    matrix.push(line16);

    $('.paladium-loader').show();
    for(var i = 0; i < 16; i++) {
        $('.paladium-loader').append('<div class="line" id="line-' + i + '"></div>');
        for(var j = 0; j < 16; j ++) {
            var type = matrix[i][j];
            var random = Math.floor((Math.random() * 5) + 0);
            $('#line-' + i).append('<div class="square square-' + random + '" data-color="' + type + '" id="line-' + (i + 1) + '-col-' + (j + 1) + '"></div>');
        }
    }
    $('.square').each(function() {
        var color = $(this).attr('data-color');
        if(color != "none") {
            $(this).css('background-color', '#' + color);
        }
    });

    $('#loading-view').fadeIn(500);
}

function hideLoading() {
    $('#loading-view').fadeOut(500);
}

function setLoadingStatut(text) {
    $("#loading-statut-text").html(text);
}

// #endregion