import {cleanupPot} from '../common'
import * as path from 'path'
import * as shell from 'shelljs'

export async function extractPot (domainName, domainConfig, potPath) {
    const type = domainConfig.get('type')
    shell.mkdir('-p', path.dirname(potPath))
    await loadExtractor(type)(domainName, domainConfig, potPath)
    cleanupPot(potPath)
}

function loadExtractor (type) {
    switch (type) {
        case 'vue-gettext':
            return require('./vue-gettext').default
        case 'vue-i18n':
            return require('./vue-i18n').default
        case 'i18next':
            return require('./i18next').default
        case 'vt':
            return require('./vt').default
        case 'python':
            return require('./python').default
        case 'angular-gettext':
            return require('./angular-gettext').default
        case 'android':
            return require('./android').default
        case 'cordova':
            return require('./cordova').default
        case 'cocos':
            return require('./cocos').default
        case 'php-gettext':
            return require('./php-gettext').default
        default:
            throw new Error(`unknown domain type: ${type}`)
    }
}
