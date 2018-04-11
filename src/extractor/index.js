import {cleanupPot} from '../common'

export async function extractPot (domainName, domainConfig, potPath) {
    const type = domainConfig.get('type')
    await loadExtractor(type)(domainName, domainConfig, potPath)
    cleanupPot(potPath)
}

function loadExtractor (type) {
    switch (type) {
        case 'vue-gettext':
            return require('./vue-gettext').default
        case 'i18next':
            return require('./i18next').default
        case 'vt':
            return require('./vt').default
        case 'python':
            return require('./python').default
        case 'angular-gettext':
            return require('./angular-gettext').default
        case 'cordova':
            return require('./cordova').default
        case 'cocos':
            return require('./cocos').default
        default:
            throw new Error(`unknown domain type: ${type}`)
    }
}
