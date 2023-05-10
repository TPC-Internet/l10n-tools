import {type DomainConfig, L10nConfig, type SyncTarget} from '../config.js'
import {readPoFile, readPoFiles, writePoFile, writePoFiles} from '../po.js';
import {type GetTextTranslations} from 'gettext-parser';

export type SyncerFunc = (config: L10nConfig, domainConfig: DomainConfig, tag: string, pot: GetTextTranslations, poData: {[locale: string]: GetTextTranslations}) => Promise<void>

export async function syncPoToTarget (config: L10nConfig, domainConfig: DomainConfig, tag: string, potPath: string, poDir: string) {
    const target = config.getSyncTarget()
    const syncer = await loadSyncer(target)
    const pot = await readPoFile(potPath)
    const poData = await readPoFiles(poDir)
    await syncer(config, domainConfig, tag, pot, poData)
    writePoFile(potPath, pot)
    writePoFiles(poDir, poData)
}

async function loadSyncer (target: SyncTarget): Promise<SyncerFunc> {
    switch (target) {
        case 'google-docs':
            return (await import('./google-docs.js')).syncPoToGoogleDocs
        case 'lokalise':
            return (await import('./lokalise.js')).syncPoToLokalise
    }
    throw new Error(`unknown sync target: ${target}`)
}
