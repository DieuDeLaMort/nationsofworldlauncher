/**
 * Nations of World Launcher
 */

const loginForm = document.getElementById('login-form');
const loginButton = document.getElementById('login-button');
const loginOfflineButton = document.getElementById('login-offline-button');
const loginOfflineUsername = document.getElementById('login-offline-username');

loginForm.onsubmit = () => { 
    return false; 
}

// ─── Microsoft Login ────────────────────────────────────────────────────────

loginButton.addEventListener('click', () => {
    onMicrosoftLogin();
});

function onMicrosoftLogin() {
    formDisabled(true);

    AuthManager.addAccount().then((value) => {
        setTimeout(() => {
            switchView(getCurrentView(), VIEWS.launcher, () => {
                formDisabled(false);
            });
            initLauncherView();
        }, 1000);
    }).catch((err) => {
        formDisabled(false);

        const errF = resolveError(err);
        showLoginError(errF.title, errF.desc);
    });
}

// ─── Offline / Crack Login ──────────────────────────────────────────────────

loginOfflineButton.addEventListener('click', () => {
    onOfflineLogin();
});

loginOfflineUsername.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') {
        e.preventDefault();
        onOfflineLogin();
    }
});

function onOfflineLogin() {
    const username = loginOfflineUsername.value.trim();

    // Validate username: 3-16 chars, alphanumeric + underscore only
    if(username.length < 3 || username.length > 16) {
        showLoginError('Pseudo invalide ! 😅', 'Le pseudo doit contenir entre 3 et 16 caractères.');
        return;
    }
    if(!/^[a-zA-Z0-9_]+$/.test(username)) {
        showLoginError('Pseudo invalide ! 😅', 'Le pseudo ne peut contenir que des lettres, chiffres et tirets bas (_).');
        return;
    }

    formDisabled(true);

    try {
        AuthManager.addOfflineAccount(username);
        setTimeout(() => {
            switchView(getCurrentView(), VIEWS.launcher, () => {
                formDisabled(false);
            });
            initLauncherView();
        }, 500);
    } catch(err) {
        formDisabled(false);
        showLoginError('Erreur ! 😭', 'Une erreur est survenue lors de la connexion hors-ligne.');
    }
}

// ─── Help Button ────────────────────────────────────────────────────────────

$("#login-help-button").click(function() {
    setOverlayContent('Aide',
        '<b>Connexion Microsoft :</b><br>'
        + 'Connectez-vous avec votre compte Microsoft qui possède Minecraft Java Édition.<br><br>'
        + '<b>Mode hors-ligne :</b><br>'
        + 'Entrez un pseudo pour jouer sans compte Microsoft (mode crack). '
        + 'Certaines fonctionnalités multijoueur peuvent être limitées.', 
        'Retour');
    toggleOverlay(true);
    setCloseHandler();
});

// ─── Error Display ──────────────────────────────────────────────────────────

function showLoginError(title, value) {
    setOverlayContent(title,
        value, 
        'Retour');
    toggleOverlay(true);
    setCloseHandler();
}

// ─── Error Resolution ───────────────────────────────────────────────────────

function resolveError(err) {
    // Microsoft/Xbox/Minecraft errors
    
    if(err.message != null && err.message === 'AUTH_WINDOW_CLOSED') {
        return {
            title: "Connexion annulée 😅",
            desc: "La fenêtre de connexion Microsoft a été fermée. <br><br>Veuillez réessayer."
        }
    }
    else if(err.message != null && err.message === 'NotPaidAccount') {
        return {
            title: "Compte sans Minecraft ! 😭",
            desc: "Votre compte Microsoft ne possède pas Minecraft Java Édition. <br><br>Vous pouvez l'acheter sur <a href=\"https://www.minecraft.net/fr-fr/store/minecraft-java-bedrock-edition-pc\">minecraft.net</a>."
        }
    }
    else if(err.XErr != null) {
        // XSTS error codes
        if(err.XErr === 2148916233) {
            return {
                title: "Compte Xbox Live requis ! 😮",
                desc: "Votre compte Microsoft n'a pas de profil Xbox Live. <br><br>Veuillez créer un profil Xbox Live sur <a href=\"https://www.xbox.com/\">xbox.com</a>."
            }
        }
        else if(err.XErr === 2148916235) {
            return {
                title: "Xbox Live non disponible ! 😱",
                desc: "Xbox Live n'est pas disponible dans votre pays/région."
            }
        }
        else if(err.XErr === 2148916238) {
            return {
                title: "Compte enfant détecté ! 🔒",
                desc: "Ce compte est un compte enfant. <br><br>Un adulte doit ajouter ce compte à une famille Microsoft."
            }
        }
    }
    else if(err.code != null) {
        if(err.code === 'ENOENT') {
            return {
                title: "Pas de connexion Internet ! 😮",
                desc: "Vous devez être connecté à Internet pour pouvoir vous connecter. <br>Veuillez vous connecter et réessayer."
            }
        } 
        else if(err.code === 'ENOTFOUND') {
            return {
                title: "Serveur d'authentification non disponible ! 😱",
                desc: "Le serveur d'authentification de Microsoft est actuellement hors ligne ou inaccessible. <br>S'il vous plaît attendez un peu et essayez à nouveau. <br><br>Vous pouvez vérifier l'état du serveur sur <a href=\"https://support.xbox.com/fr-FR/xbox-live-status\">Xbox Live Status</a>."
            }
        }
        else if(err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
            return {
                title: "Délai d'attente dépassé ! ⏳",
                desc: "La connexion au serveur d'authentification Microsoft a expiré. <br><br>Veuillez vérifier votre connexion Internet et réessayer."
            }
        }
    }
    else if(err.error != null) {
        // Microsoft OAuth2 token exchange errors
        const safeError = String(err.error).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const safeDesc = err.error_description
            ? String(err.error_description).replace(/\+/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            : "Veuillez réessayer.";
        return {
            title: "Erreur d'authentification Microsoft ! 😭",
            desc: "Erreur : " + safeError + "<br><br>" + safeDesc
        }
    }

    return {
        title: "Échec d'authentification ! 😭",
        desc: "Une erreur est survenue lors de la connexion avec Microsoft. <br><br>Veuillez réessayer."
    }
}

// ─── Form State ─────────────────────────────────────────────────────────────

function formDisabled(value) {
    loginDisabled(value);
}

function loginDisabled(value) {
    if(loginButton.disabled !== value) {
        loginButton.disabled = value;
    }
    if(loginOfflineButton.disabled !== value) {
        loginOfflineButton.disabled = value;
    }

    if(value) {
        $('#login-button-loader').show();
        $('#login-offline-button-loader').show();
    }
    else {
        $('#login-button-loader').hide();
        $('#login-offline-button-loader').hide();
    }
}