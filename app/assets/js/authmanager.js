/**
 * Paladium Launcher - https://github.com/Chaika9/paladiumlauncher
 * Copyright (C) 2019 Paladium
 */

const crypto = require('crypto');

const ConfigManager = require('./configmanager');
const Microsoft = require('./microsoft');

const logger = require('./loggerutil')('%c[AuthManager]', 'color: #a02d2a; font-weight: bold');

exports.addAccount = async function() {
    try {
        const session = await Microsoft.authenticate();
        if(session.selectedProfile != null) {
            const ret = ConfigManager.addAuthAccount(
                session.selectedProfile.id,
                session.accessToken,
                session.selectedProfile.name,
                session.selectedProfile.name,
                session.msRefreshToken,
                'microsoft'
            );
            ConfigManager.save();
            return ret;
        } 
        else {
            throw new Error('NotPaidAccount');
        }
    } 
    catch (err) {
        return Promise.reject(err);
    }
}

exports.addOfflineAccount = function(username) {
    // Generate an offline UUID consistent with Minecraft's offline mode.
    // Minecraft itself uses the same "OfflinePlayer:<name>" MD5 approach for offline UUIDs.
    // This is NOT used for security — it's purely for game compatibility.
    const offlineUUID = crypto.createHash('md5').update('OfflinePlayer:' + username).digest('hex'); // eslint-disable-line no-sync

    const ret = ConfigManager.addAuthAccount(
        offlineUUID,
        'offline',
        username,
        username,
        null,
        'offline'
    );
    ConfigManager.save();
    return ret;
}

exports.removeAccount = async function(uuid) {
    try {
        ConfigManager.removeAuthAccount(uuid);
        ConfigManager.save();
        return Promise.resolve();
    } 
    catch (err){
        return Promise.reject(err);
    }
}

exports.validateSelected = async function() {
    const current = ConfigManager.getSelectedAccount();

    // Offline accounts are always valid
    if(current.type === 'offline') {
        logger.log('Offline account - skipping token validation.');
        return true;
    }

    const isValid = await Microsoft.validate(current.accessToken);
    if(!isValid) {
        try {
            const session = await Microsoft.refresh(current.msRefreshToken);
            ConfigManager.updateAuthAccount(current.uuid, session.accessToken, session.msRefreshToken);
            ConfigManager.save();
        } 
        catch(err) {
            logger.debug('Error while validating selected profile:', err);
            
            logger.log('Account access token is invalid.');
            return false;
        }
        logger.log('Account access token validated.');
        return true;
    } 
    else {
        logger.log('Account access token validated.');
        return true;
    }
}