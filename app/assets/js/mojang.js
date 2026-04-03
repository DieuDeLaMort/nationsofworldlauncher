/**
 * Nations of World Launcher
 *
 */

const logger  = require('./loggerutil')('%c[Mojang]', 'color: #a02d2a; font-weight: bold');

const minecraftAgent = {
    name: 'Minecraft',
    version: 1
}

const authpath = 'https://authserver.mojang.com';
const statuses = [
    {
        service: 'sessionserver.mojang.com',
        status: 'grey',
        name: 'Multiplayer Session Service',
        essential: true
    },
    {
        service: 'authserver.mojang.com',
        status: 'grey',
        name: 'Authentication Service',
        essential: true
    },
    {
        service: 'textures.minecraft.net',
        status: 'grey',
        name: 'Minecraft Skins',
        essential: false
    },
    {
        service: 'api.mojang.com',
        status: 'grey',
        name: 'Public API',
        essential: false
    },
    {
        service: 'minecraft.net',
        status: 'grey',
        name: 'Minecraft.net',
        essential: false
    },
    {
        service: 'account.mojang.com',
        status: 'grey',
        name: 'Mojang Accounts Website',
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
    return new Promise((resolve, reject) => {
        fetch('https://status.mojang.com/check', {
            signal: AbortSignal.timeout(2500)
        })
        .then(response => {
            if(!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(body => {
            for(let i=0; i<body.length; i++) {
                const key = Object.keys(body[i])[0]
                for(let j=0; j<statuses.length; j++) {
                    if(statuses[j].service === key) {
                        statuses[j].status = body[i][key];
                        break;
                    }
                }
            }
            resolve(statuses);
        })
        .catch(error => {
            logger.warn('Unable to retrieve Mojang status.');
            logger.debug('Error while retrieving Mojang statuses:', error);
            for(let i=0; i<statuses.length; i++) {
                statuses[i].status = 'grey';
            }
            resolve(statuses);
        });
    });
}

exports.authenticate = function(username, password, clientToken, requestUser = true, agent = minecraftAgent) {
    return new Promise((resolve, reject) => {
        const bodyData = {
            agent,
            username,
            password,
            requestUser
        }

        if(clientToken != null) {
            bodyData.clientToken = clientToken;
        }

        fetch(authpath + '/authenticate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData),
            signal: AbortSignal.timeout(10000)
        })
        .then(async response => {
            const body = await response.json().catch(() => null);
            if(response.ok) {
                resolve(body);
            } else {
                reject(body || {code: 'ENOTFOUND'});
            }
        })
        .catch(error => {
            logger.error('Error during authentication.', error);
            reject(error);
        });
    });
}

exports.validate = function(accessToken, clientToken) {
    return new Promise((resolve, reject) => {
        fetch(authpath + '/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accessToken,
                clientToken
            }),
            signal: AbortSignal.timeout(10000)
        })
        .then(response => {
            if(response.status === 403) {
                resolve(false);
            } else {
                // 204 if valid
                resolve(true);
            }
        })
        .catch(error => {
            logger.error('Error during validation.', error);
            reject(error);
        });
    });
}

exports.invalidate = function(accessToken, clientToken) {
    return new Promise((resolve, reject) => {
        fetch(authpath + '/invalidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accessToken,
                clientToken
            }),
            signal: AbortSignal.timeout(10000)
        })
        .then(response => {
            if(response.status === 204) {
                resolve();
            } else {
                return response.json().then(body => reject(body));
            }
        })
        .catch(error => {
            logger.error('Error during invalidation.', error);
            reject(error);
        });
    });
}

exports.refresh = function(accessToken, clientToken, requestUser = true) {
    return new Promise((resolve, reject) => {
        fetch(authpath + '/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accessToken,
                clientToken,
                requestUser
            }),
            signal: AbortSignal.timeout(10000)
        })
        .then(async response => {
            const body = await response.json().catch(() => null);
            if(response.ok) {
                resolve(body);
            } else {
                reject(body);
            }
        })
        .catch(error => {
            logger.error('Error during refresh.', error);
            reject(error);
        });
    });
}