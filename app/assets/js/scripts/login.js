/**
 * Paladium Launcher - https://github.com/Chaika9/paladiumlauncher
 * Copyright (C) 2019 Paladium
 */

const loginForm = document.getElementById('login-form');
const loginButton = document.getElementById('login-button');

loginForm.onsubmit = () => { 
    return false; 
}

loginButton.addEventListener('click', () => {
    onLogin();
});

$("#login-help-button").click(function() {
    setOverlayContent('Aide',
        '~~ C\'est pour bientôt ! 💜', 
        'Retour');
    toggleOverlay(true);
    setCloseHandler();
});

function showLoginError(title, value) {
    setOverlayContent(title,
        value, 
        'Retour');
    toggleOverlay(true);
    setCloseHandler();
}

function onLogin() {
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
    }

    return {
        title: "Échec d'authentification ! 😭",
        desc: "Une erreur est survenue lors de la connexion avec Microsoft. <br><br>Veuillez réessayer."
    }
}

function formDisabled(value) {
    loginDisabled(value);
}

function loginDisabled(value) {
    if(loginButton.disabled !== value) {
        loginButton.disabled = value;
    }

    if(value) {
        $('#login-button-loader').show();
    }
    else {
        $('#login-button-loader').hide();
    }
}