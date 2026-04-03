/**
 * Nations of World Launcher - Microsoft Authentication Module
 * Implements the Microsoft OAuth2 → Xbox Live → XSTS → Minecraft authentication chain.
 */

const { BrowserWindow } = require('@electron/remote');

const logger = require('./loggerutil')('%c[Microsoft]', 'color: #a02d2a; font-weight: bold');

// Microsoft / Xbox Live OAuth – uses the public Minecraft client ID
// and the Windows Live endpoints (same approach as the msmc library).
// This is Microsoft's official public client ID for the Minecraft launcher,
// widely used by open-source launchers (msmc, prismarine-auth, etc.).
const CLIENT_ID = '00000000402b5328';
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';

const MICROSOFT_AUTH_URL = 'https://login.live.com/oauth20_authorize.srf';
const MICROSOFT_TOKEN_URL = 'https://login.live.com/oauth20_token.srf';
const XBOX_LIVE_AUTH_URL = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_AUTH_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const MINECRAFT_AUTH_URL = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const MINECRAFT_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile';
const MINECRAFT_STORE_URL = 'https://api.minecraftservices.com/entitlements/mcstore';

const statuses = [
    {
        service: 'login.live.com',
        status: 'grey',
        name: 'Microsoft Authentication',
        essential: true
    },
    {
        service: 'user.auth.xboxlive.com',
        status: 'grey',
        name: 'Xbox Live Authentication',
        essential: true
    },
    {
        service: 'api.minecraftservices.com',
        status: 'grey',
        name: 'Minecraft Services',
        essential: true
    },
    {
        service: 'sessionserver.mojang.com',
        status: 'grey',
        name: 'Multiplayer Session Service',
        essential: true
    },
    {
        service: 'textures.minecraft.net',
        status: 'grey',
        name: 'Minecraft Skins',
        essential: false
    }
];

exports.statusToHex = function(status) {
    switch(status.toLowerCase()) {
        case 'green':
            return '#a5c325';
        case 'yellow':
            return '#eac918';
        case 'red':
            return '#c32625';
        case 'grey':
        default:
            return '#848484';
    }
}

exports.status = function() {
    return new Promise((resolve) => {
        resolve(statuses);
    });
}

/**
 * Step 1: Open a BrowserWindow to the Microsoft OAuth2 login page
 * and capture the authorization code from the redirect.
 */
exports.getAuthCode = function() {
    return new Promise((resolve, reject) => {
        const authUrl = MICROSOFT_AUTH_URL
            + '?client_id=' + encodeURIComponent(CLIENT_ID)
            + '&response_type=code'
            + '&redirect_uri=' + encodeURIComponent(REDIRECT_URI)
            + '&scope=' + encodeURIComponent('XboxLive.signin offline_access')
            + '&prompt=select_account';

        const authWindow = new BrowserWindow({
            width: 520,
            height: 600,
            show: true,
            frame: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        authWindow.loadURL(authUrl);
        authWindow.removeMenu();

        let resolved = false;

        function handleNavigation(url) {
            if(resolved) return;
            if(url.indexOf(REDIRECT_URI) === 0) {
                resolved = true;

                let code = null;
                let error = null;

                // Parse query parameters from the URL
                const queryString = url.split('?')[1];
                if(queryString) {
                    const params = queryString.split('&');
                    for(let i = 0; i < params.length; i++) {
                        const pair = params[i].split('=');
                        if(pair[0] === 'code') {
                            code = decodeURIComponent(pair[1]);
                        } else if(pair[0] === 'error') {
                            error = decodeURIComponent(pair[1]);
                        }
                    }
                }

                authWindow.removeAllListeners('closed');
                authWindow.close();

                if(error) {
                    reject(new Error(error));
                } else if(code) {
                    resolve(code);
                } else {
                    reject(new Error('NO_AUTH_CODE'));
                }
            }
        }

        authWindow.webContents.on('will-redirect', (event, url) => {
            handleNavigation(url);
        });

        authWindow.webContents.on('will-navigate', (event, url) => {
            handleNavigation(url);
        });

        // Fallback: did-navigate fires after all navigation types complete,
        // ensuring the redirect is captured even if will-redirect/will-navigate
        // don't fire (e.g. same-origin redirects in some Electron versions).
        authWindow.webContents.on('did-navigate', (event, url) => {
            handleNavigation(url);
        });

        authWindow.on('closed', () => {
            if(!resolved) {
                reject(new Error('AUTH_WINDOW_CLOSED'));
            }
        });
    });
}

/**
 * Step 2: Exchange the authorization code for Microsoft access & refresh tokens.
 */
exports.getMicrosoftToken = function(authCode) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            code: authCode,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI
        });
        fetch(MICROSOFT_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
            signal: AbortSignal.timeout(10000)
        })
        .then(async response => {
            const body = await response.json().catch(() => null);
            if(response.ok) {
                resolve(body);
            } else {
                reject(body || { error: 'MICROSOFT_TOKEN_ERROR' });
            }
        })
        .catch(error => {
            logger.error('Error during Microsoft token exchange.', error);
            reject(error);
        });
    });
}

/**
 * Step 2b: Refresh the Microsoft access token using a refresh token.
 */
exports.refreshMicrosoftToken = function(refreshToken) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        });
        fetch(MICROSOFT_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
            signal: AbortSignal.timeout(10000)
        })
        .then(async response => {
            const body = await response.json().catch(() => null);
            if(response.ok) {
                resolve(body);
            } else {
                reject(body || { error: 'MICROSOFT_REFRESH_ERROR' });
            }
        })
        .catch(error => {
            logger.error('Error during Microsoft token refresh.', error);
            reject(error);
        });
    });
}

/**
 * Step 3: Authenticate with Xbox Live using the Microsoft access token.
 */
exports.getXboxLiveToken = function(msAccessToken) {
    return new Promise((resolve, reject) => {
        fetch(XBOX_LIVE_AUTH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                Properties: {
                    AuthMethod: 'RPS',
                    SiteName: 'user.auth.xboxlive.com',
                    RpsTicket: 'd=' + msAccessToken
                },
                RelyingParty: 'http://auth.xboxlive.com',
                TokenType: 'JWT'
            }),
            signal: AbortSignal.timeout(10000)
        })
        .then(async response => {
            const body = await response.json().catch(() => null);
            if(response.ok) {
                resolve(body);
            } else {
                reject(body || { error: 'XBOX_LIVE_AUTH_ERROR' });
            }
        })
        .catch(error => {
            logger.error('Error during Xbox Live authentication.', error);
            reject(error);
        });
    });
}

/**
 * Step 4: Get an XSTS token using the Xbox Live token.
 */
exports.getXSTSToken = function(xblToken) {
    return new Promise((resolve, reject) => {
        fetch(XSTS_AUTH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                Properties: {
                    SandboxId: 'RETAIL',
                    UserTokens: [xblToken]
                },
                RelyingParty: 'rp://api.minecraftservices.com/',
                TokenType: 'JWT'
            }),
            signal: AbortSignal.timeout(10000)
        })
        .then(async response => {
            const body = await response.json().catch(() => null);
            if(response.ok) {
                resolve(body);
            } else {
                reject(body || { error: 'XSTS_AUTH_ERROR', XErr: null, statusCode: response.status });
            }
        })
        .catch(error => {
            logger.error('Error during XSTS authentication.', error);
            reject(error);
        });
    });
}

/**
 * Step 5: Authenticate with Minecraft using the XSTS token.
 */
exports.getMinecraftToken = function(xstsToken, userHash) {
    return new Promise((resolve, reject) => {
        fetch(MINECRAFT_AUTH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identityToken: 'XBL3.0 x=' + userHash + ';' + xstsToken
            }),
            signal: AbortSignal.timeout(10000)
        })
        .then(async response => {
            const body = await response.json().catch(() => null);
            if(response.ok) {
                resolve(body);
            } else {
                reject(body || { error: 'MINECRAFT_AUTH_ERROR' });
            }
        })
        .catch(error => {
            logger.error('Error during Minecraft authentication.', error);
            reject(error);
        });
    });
}

/**
 * Step 6: Check if the Microsoft account owns Minecraft.
 */
exports.checkMinecraftOwnership = function(mcAccessToken) {
    return new Promise((resolve, reject) => {
        fetch(MINECRAFT_STORE_URL, {
            headers: {
                Authorization: 'Bearer ' + mcAccessToken
            },
            signal: AbortSignal.timeout(10000)
        })
        .then(async response => {
            const body = await response.json().catch(() => null);
            if(response.ok) {
                const hasMinecraft = body && body.items && body.items.length > 0;
                resolve(hasMinecraft);
            } else {
                reject(body || { error: 'OWNERSHIP_CHECK_ERROR' });
            }
        })
        .catch(error => {
            logger.error('Error during Minecraft ownership check.', error);
            reject(error);
        });
    });
}

/**
 * Step 7: Get the Minecraft profile (UUID and username).
 */
exports.getMinecraftProfile = function(mcAccessToken) {
    return new Promise((resolve, reject) => {
        fetch(MINECRAFT_PROFILE_URL, {
            headers: {
                Authorization: 'Bearer ' + mcAccessToken
            },
            signal: AbortSignal.timeout(10000)
        })
        .then(async response => {
            const body = await response.json().catch(() => null);
            if(response.ok) {
                resolve(body);
            } else {
                reject(body || { error: 'MINECRAFT_PROFILE_ERROR' });
            }
        })
        .catch(error => {
            logger.error('Error during Minecraft profile retrieval.', error);
            reject(error);
        });
    });
}

/**
 * Complete the auth chain from Microsoft tokens to Minecraft profile.
 * Used for both initial login and token refresh.
 */
exports.authenticateWithTokens = async function(msAccessToken, msRefreshToken) {
    // Step 3: Xbox Live authentication
    const xblResponse = await exports.getXboxLiveToken(msAccessToken);
    const xblToken = xblResponse.Token;
    const userHash = xblResponse.DisplayClaims.xui[0].uhs;
    logger.log('Xbox Live authentication successful.');

    // Step 4: XSTS authentication
    const xstsResponse = await exports.getXSTSToken(xblToken);
    const xstsToken = xstsResponse.Token;
    logger.log('XSTS authentication successful.');

    // Step 5: Minecraft authentication
    const mcResponse = await exports.getMinecraftToken(xstsToken, userHash);
    const mcAccessToken = mcResponse.access_token;
    logger.log('Minecraft authentication successful.');

    // Step 6: Check ownership
    const ownsMinecraft = await exports.checkMinecraftOwnership(mcAccessToken);
    if(!ownsMinecraft) {
        throw new Error('NotPaidAccount');
    }
    logger.log('Minecraft ownership verified.');

    // Step 7: Get profile
    const profile = await exports.getMinecraftProfile(mcAccessToken);
    logger.log('Minecraft profile retrieved:', profile.name);

    return {
        accessToken: mcAccessToken,
        msRefreshToken: msRefreshToken,
        selectedProfile: {
            id: profile.id,
            name: profile.name
        }
    };
}

/**
 * Full authentication flow: opens Microsoft login window and completes the chain.
 */
exports.authenticate = async function() {
    logger.log('Starting Microsoft authentication flow...');

    // Step 1: Get authorization code via browser window
    const authCode = await exports.getAuthCode();
    logger.log('Authorization code obtained.');

    // Step 2: Exchange for Microsoft tokens
    const msTokens = await exports.getMicrosoftToken(authCode);
    logger.log('Microsoft tokens obtained.');

    return await exports.authenticateWithTokens(msTokens.access_token, msTokens.refresh_token);
}

/**
 * Refresh flow: uses stored Microsoft refresh token to get new tokens.
 */
exports.refresh = async function(msRefreshToken) {
    logger.log('Refreshing Microsoft authentication...');

    const msTokens = await exports.refreshMicrosoftToken(msRefreshToken);
    logger.log('Microsoft token refreshed.');

    return await exports.authenticateWithTokens(msTokens.access_token, msTokens.refresh_token);
}

/**
 * Validate a Minecraft access token by checking the profile endpoint.
 */
exports.validate = function(mcAccessToken) {
    return new Promise((resolve, reject) => {
        fetch(MINECRAFT_PROFILE_URL, {
            headers: {
                Authorization: 'Bearer ' + mcAccessToken
            },
            signal: AbortSignal.timeout(5000)
        })
        .then(response => {
            resolve(response.ok);
        })
        .catch(error => {
            logger.error('Error during validation.', error);
            reject(error);
        });
    });
}
