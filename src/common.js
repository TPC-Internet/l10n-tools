import fs from 'fs'
import * as gettextParser from 'gettext-parser'
import glob from 'glob-promise'
import log from 'npmlog'
import path from 'path'
import * as shell from 'shelljs'
import {forPoEntries, getPoEntry, getPoEntryFlag, setPoEntryFlag} from './po'
import {execWithLog, requireCmd} from './utils'

export async function getSrcPaths (config, exts) {
    const srcDirs = config.get('src-dirs', [])
    const srcPatterns = config.get('src-patterns', [])
    if (srcDirs.length === 0 && srcPatterns.length === 0) {
        throw new Error(`config '${config.appendPrefix('src-dirs')}' or '${config.appendPrefix('src-patterns')}' is required`)
    }

    for (const srcDir of srcDirs) {
        for (const ext of exts) {
            srcPatterns.push(path.join(srcDir, '**', '*' + ext))
        }
    }

    const srcPaths = []
    for (const srcPattern of srcPatterns) {
        srcPaths.push(...await glob.promise(srcPattern))
    }
    return srcPaths
}

export async function xgettext (domainName, language, keywords, potPath, srcPaths, merge) {
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

export function updatePo (potPath, fromPoDir, poDir, locales) {
    shell.mkdir('-p', poDir)
    const potInput = fs.readFileSync(potPath)
    for (const locale of locales) {
        const poFile = locale + '.po'
        const fromPoPath = path.join(fromPoDir, poFile)

        const pot = gettextParser.po.parse(potInput, 'UTF-8')
        pot.headers['language'] = locale
        if (fs.existsSync(fromPoPath)) {
            const fromPoInput = fs.readFileSync(fromPoPath)
            const fromPo = gettextParser.po.parse(fromPoInput, 'UTF-8')
            forPoEntries(pot, potEntry => {
                const fromPoEntry = getPoEntry(fromPo, potEntry.msgctxt, potEntry.msgid)
                if (fromPoEntry != null) {
                    potEntry.msgstr = fromPoEntry.msgstr.map(value => value === '$$no translation$$' ? '' : value)
                    const flag = getPoEntryFlag(fromPoEntry)
                    if (flag) {
                        setPoEntryFlag(potEntry, flag)
                    }
                }
            })
        }

        const output = gettextParser.po.compile(pot)
        const poPath = path.join(poDir, poFile)
        fs.writeFileSync(poPath, output)
        cleanupPo(poPath)
    }
}

export async function mergeFallbackLocale(domainName, poDir, fallbackLocale, mergedPoDir) {
    shell.mkdir('-p', mergedPoDir)
    const fallbackPoPath = path.join(poDir, fallbackLocale + '.po')
    const fallbackInput = fs.readFileSync(fallbackPoPath)
    const fallbackPo = gettextParser.po.parse(fallbackInput, 'UTF-8')

    const poPaths = await glob.promise(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const poInput = fs.readFileSync(poPath)
        const po = gettextParser.po.parse(poInput, 'UTF-8')
        if (locale !== fallbackLocale) {
            forPoEntries(po, poEntry => {
                if (!poEntry.msgstr[0]) {
                    const fallbackPoEntry = getPoEntry(fallbackPo, poEntry.msgctxt, poEntry.msgid)
                    if (fallbackPoEntry != null && fallbackPoEntry.msgstr[0]) {
                        poEntry.msgstr = fallbackPoEntry.msgstr
                    }
                }
            })
        }
        const output = gettextParser.po.compile(po)
        const mergedPoPath = path.join(mergedPoDir, path.basename(poPath))
        fs.writeFileSync(mergedPoPath, output)
        cleanupPo(mergedPoPath)
    }
}

export async function compilePoToMo (domainName, poDir, targetDir) {
    shell.mkdir('-p', targetDir)
    const poPaths = await glob.promise(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const moDir = path.join(targetDir, locale, 'LC_MESSAGES')
        const moPath = path.join(moDir, domainName + '.mo')

        const input = fs.readFileSync(poPath)
        const po = gettextParser.po.parse(input, 'UTF-8')
        const output = gettextParser.mo.compile(po)

        shell.mkdir('-p', moDir)
        fs.writeFileSync(moPath, output)
    }
}

export function cleanupPot (potPath) {
    // POT-Creation-Date 항목이 자꾸 바뀌어서 diff 생기는 것 방지
    // 빈 주석, fuzzy 마크 지우기
    const input = fs.readFileSync(potPath, {encoding: 'UTF-8'})
    let output = input
        .replace(/^"POT-Creation-Date:.*\n/mg, '')
        .replace(/^# *\n/mg, '')
        .replace(/^#, fuzzy *\n/mg, '')
        .replace(/^(#.*), fuzzy(.*)/mg, '$1$2')
    if (!output.endsWith('\n'))
        output += '\n'
    fs.writeFileSync(potPath, output, {encoding: 'UTF-8'})
}

export function cleanupPo (poPath) {
    // POT-Creation-Date 항목 제가 (쓸데없는 diff 방지)
    // 빈 주석, fuzzy 마크 지우기
    // source 주석 제거 (쓸데없는 diff 방지)
    // Language 항목 제대로 설정
    const language = path.basename(poPath, '.po')
    const input = fs.readFileSync(poPath, {encoding: 'UTF-8'})
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
    fs.writeFileSync(poPath, output, {encoding: 'UTF-8'})
}

export function handleMarker(src, srcIndex, marker, fn) {
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
