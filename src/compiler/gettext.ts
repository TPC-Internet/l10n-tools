import log from 'npmlog'
import {type CompilerConfig} from '../config.js'
import * as path from "path"
import * as gettextParser from "gettext-parser"
import {type GetTextTranslation, type GetTextTranslations} from 'gettext-parser'
import fsp from 'node:fs/promises'
import {getPluralKeys, readTransEntries, type TransEntry} from '../entry.js'
import {fileURLToPath} from 'url'
import {extractLocaleFromTransPath, listTransPaths} from '../utils.js'

export async function compileToPoJson(domainName: string, config: CompilerConfig, transDir: string) {
    const targetDir = config.getTargetDir()
    log.info('compile', `generating json files to '${targetDir}/${domainName}/{locale}.json'`)
    await fsp.mkdir(targetDir, {recursive: true})
    const transPaths = await listTransPaths(transDir)
    for (const transPath of transPaths) {
        const locale = extractLocaleFromTransPath(transPath)
        const jsonPath = path.join(targetDir, locale + '.json')
        const po = await createPo(domainName, locale, await readTransEntries(transPath))

        await fsp.mkdir(targetDir, {recursive: true})
        await fsp.writeFile(jsonPath, JSON.stringify(po, null, 2))
    }
}

export async function compileToMo(domainName: string, config: CompilerConfig, transDir: string) {
    const targetDir = config.getTargetDir()
    log.info('compile', `generating mo files to '${targetDir}/{locale}/LC_MESSAGES/${domainName}.mo'`)
    await fsp.mkdir(targetDir, {recursive: true})
    const transPaths = await listTransPaths(transDir)
    for (const transPath of transPaths) {
        const locale = extractLocaleFromTransPath(transPath)
        const moDir = path.join(targetDir, locale, 'LC_MESSAGES')
        const moPath = path.join(moDir, domainName + '.mo')

        const po = await createPo(domainName, locale, await readTransEntries(transPath))
        const output = gettextParser.mo.compile(po, {sort})

        await fsp.mkdir(moDir, {recursive: true})
        await fsp.writeFile(moPath, output)
    }
}

async function createPo(domainName: string, locale: string, transEntries: TransEntry[]): Promise<GetTextTranslations> {
    const dirname = path.dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(await fsp.readFile(path.join(dirname, '../..', 'package.json'), {encoding: 'utf-8'}))
    const po: GetTextTranslations = {
        charset: 'utf-8',
        headers: {
            'Project-Id-Version': domainName,
            'Mime-Version': '1.0',
            'Content-Type': 'text/plain; charset=UTF-8',
            'Content-Transfer-Encoding': '8bit',
            'X-Generator': `l10n-tools ${pkg.version}`,
            'Language': locale
        },
        translations: {}
    }
    for (const transEntry of transEntries) {
        const msgctxt = transEntry.context || ''
        const msgid = transEntry.key
        if (po.translations[msgctxt] == null) {
            po.translations[msgctxt] = {}
        }
        po.translations[msgctxt][msgid] = createPoEntry(locale, transEntry)
    }
    return po
}

function createPoEntry(locale: string, transEntry: TransEntry): GetTextTranslation {
    if (!transEntry.messages['other'] || Object.keys(transEntry.messages).length == 1) {
        return {
            msgctxt: transEntry.context || undefined,
            msgid: transEntry.key,
            msgstr: [transEntry.messages['other'] || '']
        }
    } else {
        const msgstr: string[] = []
        for (const key of getPluralKeys(locale)) {
            msgstr.push(transEntry.messages[key] || transEntry.messages['other'] || '')
        }
        return {
            msgctxt: transEntry.context || undefined,
            msgid: transEntry.key,
            msgid_plural: transEntry.key,
            msgstr: msgstr
        }
    }
}

function compareMsgctxt(left: string | undefined, right: string | undefined) {
    if (left && right) {
        if (left < right)
            return -1
        if (left > right)
            return 1
        return 0
    } else {
        if (right)
            return -1
        if (left)
            return 1
        return 0
    }
}

function compareMsgid(left: string, right: string) {
    if (left < right)
        return -1
    if (left > right)
        return 1
    return 0
}

function sort(left: GetTextTranslation, right: GetTextTranslation) {
    const order = compareMsgid(left.msgid, right.msgid)
    if (order !== 0)
        return order
    return compareMsgctxt(left.msgctxt, right.msgctxt)
}
