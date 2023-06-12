import log from 'npmlog'
import {type CompilerConfig} from '../config.js'
import {readTransEntries} from '../entry.js'
import shell from 'shelljs'
import path from 'path'
import fs from 'node:fs/promises'
import {extractLocaleFromTransPath, listTransPaths} from '../utils.js'

export async function compileToJson(domainName: string, config: CompilerConfig, transDir: string) {
    const targetPath = config.getTargetPath()
    log.info('compile', `generating json file to '${targetPath}'`)

    const translations: {[locale: string]: PoJson} = {}
    const transPaths = await listTransPaths(transDir)
    for (const transPath of transPaths) {
        const locale = extractLocaleFromTransPath(transPath)
        translations[locale] = await exportTransToJson(transPath, {keySeparator: null})
    }
    await fs.writeFile(targetPath, JSON.stringify(translations, null, 2))
}

export async function compileToJsonDir(domainName: string, config: CompilerConfig, transDir: string) {
    const targetDir = config.getTargetDir()
    const useLocaleKey = config.useLocaleKey()
    const keySeparator = config.getKeySeparator()
    log.info('compile', `generating json files '${targetDir}/{locale}.json' (locale key: ${useLocaleKey})`)

    shell.mkdir('-p', targetDir)
    const transPaths = await listTransPaths(transDir)
    for (const transPath of transPaths) {
        const locale = extractLocaleFromTransPath(transPath)
        const json = await exportTransToJson(transPath, {keySeparator})
        const jsonPath = path.join(targetDir, locale + '.json')
        if (useLocaleKey) {
            await fs.writeFile(jsonPath, JSON.stringify({[locale]: json}, null, 2))
        } else {
            await fs.writeFile(jsonPath, JSON.stringify(json, null, 2))
        }
    }
}

type PoJson = {[key: string]: string} | {[key: string]: PoJson}

async function exportTransToJson (transPath: string, opts?: {keySeparator?: string | null}): Promise<PoJson> {
    const {keySeparator = '.'} = opts ?? {}
    const json: PoJson = {}
    const transEntries = await readTransEntries(transPath)
    for (const transEntry of transEntries) {
        if (transEntry.context) {
            throw new Error('[exportPoToJson] po entry with msgctxt not supported yet')
        }

        if (transEntry.key && transEntry.messages.other) {
            const keys = keySeparator ? transEntry.messages.other.split(keySeparator) : [transEntry.key]
            const lastKey = keys.pop() as string

            let obj = json
            for (const key of keys) {
                if (!obj.hasOwnProperty(key)) {
                    obj[key] = {}
                }
                obj = obj[key] as {[key: string]: PoJson}
            }
            obj[lastKey] = transEntry.messages.other
        }
    }
    return json
}
