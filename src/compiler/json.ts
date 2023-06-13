import log from 'npmlog'
import {type CompilerConfig} from '../config.js'
import {getPluralKeys, readTransEntries} from '../entry.js'
import shell from 'shelljs'
import path from 'path'
import fs from 'node:fs/promises'
import {extractLocaleFromTransPath, listTransPaths} from '../utils.js'

export async function compileToJson(domainName: string, config: CompilerConfig, transDir: string) {
    const targetPath = config.getTargetPath()
    log.info('compile', `generating json file to '${targetPath}'`)

    const translations: {[locale: string]: JsonTrans} = {}
    const transPaths = await listTransPaths(transDir)
    for (const transPath of transPaths) {
        const locale = extractLocaleFromTransPath(transPath)
        translations[locale] = await exportTransToJson(locale, transPath)
    }
    await fs.writeFile(targetPath, JSON.stringify(translations, null, 2))
}

type JsonPluralType = 'vue-i18n' | 'node-i18n' | 'i18next'

export function compileToJsonDir(pluralType?: JsonPluralType) {
    return async function (domainName: string, config: CompilerConfig, transDir: string) {
        const targetDir = config.getTargetDir()
        const useLocaleKey = config.useLocaleKey()
        log.info('compile', `generating json files '${targetDir}/{locale}.json' (locale key: ${useLocaleKey})`)

        shell.mkdir('-p', targetDir)
        const transPaths = await listTransPaths(transDir)
        for (const transPath of transPaths) {
            const locale = extractLocaleFromTransPath(transPath)
            const json = await exportTransToJson(locale, transPath, pluralType)
            const jsonPath = path.join(targetDir, locale + '.json')
            if (useLocaleKey) {
                await fs.writeFile(jsonPath, JSON.stringify({[locale]: json}, null, 2))
            } else {
                await fs.writeFile(jsonPath, JSON.stringify(json, null, 2))
            }
        }
    }
}

type JsonTransValue = string | {[transKey: string]: string}
type JsonTrans = {
    [key: string]: JsonTransValue
}

async function exportTransToJson (locale: string, transPath: string, pluralType?: JsonPluralType): Promise<JsonTrans> {
    const json: JsonTrans = {}
    const transEntries = await readTransEntries(transPath)
    for (const transEntry of transEntries) {
        if (transEntry.context) {
            throw new Error('[exportTransToJson] trans entry with context is not supported yet')
        }
        if (!transEntry.key || !transEntry.messages['other']) {
            continue
        }

        if (Object.keys(transEntry.messages).length == 1) {
            json[transEntry.key] = transEntry.messages['other']
        } else if (pluralType == 'vue-i18n') {
            const messages: string[] = []
            for (const key of getPluralKeys(locale)) {
                messages.push(transEntry.messages[key] ?? transEntry.messages['other'])
            }
            json[transEntry.key] = messages.join(' | ')
        } else if (pluralType == 'node-i18n') {
            json[transEntry.key] = transEntry.messages
        } else if (pluralType == 'i18next') {
            for (const [transKey, message] of Object.entries(transEntry.messages)) {
                json[`${transEntry.key}_${transKey}`] = message
            }
        } else {
            log.warn('compile', `unsupported plural type: ${pluralType}`)
        }
    }
    return json
}
