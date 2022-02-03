import {cleanupPot} from '../common'
import * as path from 'path'
import * as shell from 'shelljs'

export async function extractPot (domainName, domainConfig, potPath) {
    const type = domainConfig.get('type')
    shell.mkdir('-p', path.dirname(potPath))
    const extractor = await loadExtractor(type)
    await extractor(domainName, domainConfig, potPath)
    cleanupPot(potPath)
}

async function loadExtractor (type) {
    switch (type) {
        case 'react':
            return (await import('./react')).default
        case 'vue-gettext':
            return (await import('./vue-gettext')).default
        case 'vue-i18n':
            return (await import('./vue-i18n')).default
        case 'javascript':
        case 'i18next':
            return (await import('./javascript')).default
        case 'vt':
            return (await import('./vt')).default
        case 'python':
            return (await import('./python')).default
        case 'angular-gettext':
            return (await import('./angular-gettext')).default
        case 'android':
            return (await import('./android')).default
        case 'ios':
            return (await import('./ios')).default
        case 'cordova':
            return (await import('./cordova')).default
        case 'cocos':
            return (await import('./cocos')).default
        case 'php-gettext':
            return (await import('./php-gettext')).default
        default:
            throw new Error(`unknown domain type: ${type}`)
    }
}
