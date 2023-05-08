import {cleanupPot} from '../common'
import * as path from 'path'
import * as shell from 'shelljs'
import {DomainConfig, DomainType} from '../config';

export type ExtractorFunc = (domainName: string, domainConfig: DomainConfig, potPath: string) => Promise<void>

export async function extractPot (domainName: string, domainConfig: DomainConfig, potPath: string) {
    const type = domainConfig.getType()
    shell.mkdir('-p', path.dirname(potPath))
    const extractor = await loadExtractor(type)
    await extractor(domainName, domainConfig, potPath)
    cleanupPot(potPath)
}

async function loadExtractor (type: DomainType): Promise<ExtractorFunc> {
    switch (type) {
        case 'vue-gettext':
            return (await import('./vue-gettext')).default
        case 'vue-i18n':
            return (await import('./vue-i18n')).default
        case 'react':
        case 'javascript':
        case 'typescript':
        case 'i18next':
            return (await import('./javascript')).default
        case 'python':
            return (await import('./python')).default
        case 'android':
            return (await import('./android')).default
        case 'ios':
            return (await import('./ios')).default
        case 'php-gettext':
            return (await import('./php-gettext')).default
    }
    throw new Error(`unknown domain type: ${type}`)
}
