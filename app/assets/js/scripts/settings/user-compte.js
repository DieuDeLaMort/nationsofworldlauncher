/**
 * Paladium Launcher - https://github.com/Chaika9/paladiumlauncher
 * Copyright (C) 2019 Paladium
 */

function initSettingsUserCompteTab() {
    const selectedAcc = ConfigManager.getSelectedAccount();
    $("#settings-user-compte-displayname-label").html(selectedAcc.displayName);

    if(selectedAcc.type === 'offline') {
        $("#settings-user-compte-username-label").html('Mode hors-ligne');
    } else {
        $("#settings-user-compte-username-label").html(selectedAcc.username);
    }

    $("#settings-user-compte-profile").css("background-image", "url('https://mc-heads.net/head/" + selectedAcc.displayName + "')");
}

$("#settings-user-logout-button").click(function() {
    const selectedAcc = ConfigManager.getSelectedAccount();
    const logoutMsg = selectedAcc.type === 'offline'
        ? 'Êtes-vous sûr de vouloir vous déconnecter du mode hors-ligne ?'
        : 'Êtes-vous sûr de vouloir vous déconnecter ?'
            + '<br><br>Il faudra de nouveau vous connecter avec votre compte Microsoft pour vous reconnecter. 😐';

    setOverlayContent('Se déconnecter', logoutMsg, 'Retour', 'Se déconnecter');
    toggleOverlay(true);
    
    setCloseHandler();
    setActionHandler(() => {
        toggleOverlay(false);
        
        ConfigManager.removeAuthAccount(ConfigManager.getSelectedAccount().uuid);
        ConfigManager.save();

        switchView(getCurrentView(), VIEWS.login);
    });
});