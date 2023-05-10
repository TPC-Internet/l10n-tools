import fs from 'fs'
import {po as gettextPo, type GetTextTranslations} from 'gettext-parser'
import {glob} from 'glob'
import log from 'npmlog'
import * as path from 'path'
import shell from 'shelljs'
import {getPoEntries, findPoEntry, getPoEntryFlag, setPoEntryFlag, readPoFile, writePoFile} from './po.js'
import {execWithLog, requireCmd} from './utils.js'
import {type DomainConfig, ValidationConfig} from './config.js'
import {validateMsg} from './validator.js'

export async function getSrcPaths (config: DomainConfig, exts: string[]): Promise<string[]> {
    const srcDirs = config.getSrcDirs()
    const srcPatterns = config.getSrcPatterns()
    if (srcDirs.length === 0 && srcPatterns.length === 0) {
        throw new Error('domain config has no src-dirs nor src-patterns')
    }

    for (const srcDir of srcDirs) {
        for (const ext of exts) {
            srcPatterns.push(path.join(srcDir, '**', '*' + ext))
        }
    }

    const srcPaths: string[] = []
    for (const srcPattern of srcPatterns) {
        srcPaths.push(...await glob(srcPattern))
    }
    return srcPaths
}

export async function xgettext (domainName: string, language: string, keywords: string[], potPath: string, srcPaths: string[], merge: boolean) {
    await requireCmd.brew('xgettext', 'gettext', true)
    log.info('xgettext', `from ${language} source`)
    await execWithLog(
        `xgettext --language="${language}" \
            ${keywords.map(keyword => `--keyword="${keyword}"`).join(' ')} \
            --from-code=UTF-8 --no-wrap \
            ${merge ? '--join-existing' : ''} \
            --package-name="${domainName}" \
            --output="${potPath}" \
            ${srcPaths.join(' ')}`, 'xgettext')
}

export function updatePo (potPath: string, fromPoDir: string, poDir: string, locales: string[], validationConfig: ValidationConfig | null) {
    shell.mkdir('-p', poDir)
    const potInput = fs.readFileSync(potPath)
    let basePo: GetTextTranslations | null = null
    const baseLocale = validationConfig?.getBaseLocale() ?? null
    const skip = validationConfig?.getSkip() ?? false
    if (baseLocale != null) {
        try {
            basePo = readPoFile(path.join(fromPoDir, baseLocale + '.po'))
        } catch (err) {
            log.warn('updatePo', 'Failed to read validation base locale file')
        }
    }
    for (const locale of locales) {
        const poFile = locale + '.po'
        const fromPoPath = path.join(fromPoDir, poFile)

        const pot = gettextPo.parse(potInput, {defaultCharset: 'UTF-8'})
        pot.headers['language'] = locale
        if (fs.existsSync(fromPoPath)) {
            const fromPo = readPoFile(fromPoPath)
            for (const potEntry of getPoEntries(pot)) {
                const fromPoEntry = findPoEntry(fromPo, potEntry.msgctxt || null, potEntry.msgid)
                if (fromPoEntry != null) {
                    potEntry.msgstr = fromPoEntry.msgstr.map(value => value === '$$no translation$$' ? '' : value)
                    if (baseLocale != locale) {
                        try {
                            let baseMsg: string
                            if (basePo == null) {
                                baseMsg = potEntry.msgid
                            } else {
                                const basePoEntry = findPoEntry(basePo, potEntry.msgctxt || null, potEntry.msgid)
                                baseMsg = basePoEntry?.msgstr[0] ?? potEntry.msgid
                            }
                            validateMsg(baseMsg, potEntry.msgstr[0])
                        } catch (err: any) {
                            log.warn('validation', `[${locale}] ${err.constructor.name}: ${err.message}`)
                            if (potEntry.msgctxt) {
                                log.warn('validation', `ctxt: \`${potEntry.msgctxt}'`)
                            }
                            log.warn('validation', `key: \`${potEntry.msgid}'`)
                            if (!skip) {
                                throw err
                            }
                        }
                    }
                    const flag = getPoEntryFlag(fromPoEntry)
                    if (flag) {
                        setPoEntryFlag(potEntry, flag)
                    }
                }
            }
        }

        const poPath = path.join(poDir, poFile)
        writePoFile(poPath, pot)
        cleanupPo(poPath)
    }
}

export async function mergeFallbackLocale(domainName: string, poDir: string, fallbackLocale: string, mergedPoDir: string): Promise<void> {
    shell.mkdir('-p', mergedPoDir)
    const fallbackPo = readPoFile(path.join(poDir, fallbackLocale + '.po'))

    const poPaths = await glob(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const po = readPoFile(poPath)
        if (locale !== fallbackLocale) {
            for (const poEntry of getPoEntries(po)) {
                if (!poEntry.msgstr[0]) {
                    const fallbackPoEntry = findPoEntry(fallbackPo, poEntry.msgctxt || null, poEntry.msgid)
                    if (fallbackPoEntry != null && fallbackPoEntry.msgstr[0]) {
                        poEntry.msgstr = fallbackPoEntry.msgstr
                    }
                }
            }
        }
        const mergedPoPath = path.join(mergedPoDir, path.basename(poPath))
        writePoFile(mergedPoPath, po)
        cleanupPo(mergedPoPath)
    }
}

export function cleanupPot (potPath: string) {
    // POT-Creation-Date 항목이 자꾸 바뀌어서 diff 생기는 것 방지
    // 빈 주석, fuzzy 마크 지우기
    const input = fs.readFileSync(potPath, {encoding: 'utf-8'})
    let output = input
        .replace(/^"POT-Creation-Date:.*\n/mg, '')
        .replace(/^# *\n/mg, '')
        .replace(/^#, fuzzy *\n/mg, '')
        .replace(/^(#.*), fuzzy(.*)/mg, '$1$2')
    if (!output.endsWith('\n'))
        output += '\n'
    fs.writeFileSync(potPath, output, {encoding: 'utf-8'})
}

export function cleanupPo (poPath: string) {
    // POT-Creation-Date 항목 제가 (쓸데없는 diff 방지)
    // 빈 주석, fuzzy 마크 지우기
    // source 주석 제거 (쓸데없는 diff 방지)
    // Language 항목 제대로 설정
    const language = path.basename(poPath, '.po')
    const input = fs.readFileSync(poPath, {encoding: 'utf-8'})
    let output = input
        .replace(/^"POT-Creation-Date:.*\n/mg, '')
        .replace(/^# *\n/mg, '')
        .replace(/^#, fuzzy *\n/mg, '')
        .replace(/^(#.*), fuzzy(.*)/mg, '$1$2')
        .replace(/^#:.*\n/mg, '')
        .replace(/^"Content-Type: .*\\n"/mg, '"Content-Type: text/plain; charset=UTF-8\\n"')
        .replace(/^"Language: \\n"/mg, `"Language: ${language}\\n"`)
    if (!output.endsWith('\n'))
        output += '\n'
    fs.writeFileSync(poPath, output, {encoding: 'utf-8'})
}

export type TemplateMarker = {
    start: string
    end: string
    type?: string
}

export function handleMarker(src: string, srcIndex: number, marker: TemplateMarker, fn: (inMarker: boolean, content: string) => void) {
    while (true) {
        let startOffset = src.indexOf(marker.start, srcIndex)
        if (startOffset === -1)
            break

        let endOffset = src.indexOf(marker.end, startOffset + marker.start.length)
        if (endOffset === -1) {
            srcIndex = startOffset + marker.start.length
            continue
        }

        if (startOffset > srcIndex) {
            fn(false, src.substring(srcIndex, startOffset))
        }

        endOffset += marker.end.length
        const content = src.substring(startOffset, endOffset)
        fn(true, content)
        srcIndex = endOffset
    }
    fn(false, src.substring(srcIndex))
}
