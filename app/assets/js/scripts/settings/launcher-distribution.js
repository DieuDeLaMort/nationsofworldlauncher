/**
 * Nations of World Launcher
 */

const initSettingsLauncherDistroTextField = document.getElementById('settings-launcher-distro-textfield');

function initSettingsLauncherDistroTab() {
    if(ConfigManager.getDistroCustom() == "true") {
        initSettingsLauncherDistroTextField.setAttribute("value", ConfigManager.getDistroURL());
    }
    else {
        initSettingsLauncherDistroTextField.setAttribute("value", "");
    }
}