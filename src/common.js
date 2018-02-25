import fs from 'fs'
import gettextParser from 'gettext-parser'
import glob from 'glob-promise'
import path from 'path'
import shell from 'shelljs'
import {execWithLog, getDomainConfig, requireCmd} from './utils'

export async function getDomainSrcPaths (rc, domainName, exts) {
    const srcDirs = getDomainConfig(rc, domainName, 'src-dirs', [])
    const srcPatterns = getDomainConfig(rc, domainName, 'src-patterns', [])
    if (srcDirs.length === 0 && srcPatterns.length === 0) {
        throw new Error(`config 'domains.${domainName}.src-dirs' or 'domains.${domainName}.src-patterns' is required`)
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
    shell.mkdir('-p', path.dirname(potPath))
    console.info(`[l10n:${domainName}] [xgettext] from ${language} source`)
    await execWithLog(
        `xgettext --language="${language}" \
            ${keywords.map(keyword => `--keyword="${keyword}"`).join(' ')} \
            --from-code=UTF-8 --no-wrap \
            ${merge ? '--join-existing' : ''} \
            --package-name="${domainName}" \
            --output="${potPath}" \
            ${srcPaths.join(' ')}`,
        `[l10n:${domainName}] [xgettext]`
    )
}

export async function updatePo (domainName, potPath, poDir, locales) {
    const potInput = fs.readFileSync(potPath)
    for (const locale of locales) {
        const poFile = locale + '.po'
        const poPath = path.join(poDir, poFile)

        const pot = gettextParser.po.parse(potInput, 'UTF-8')
        pot.headers['language'] = locale
        if (fs.existsSync(poPath)) {
            const poInput = fs.readFileSync(poPath)
            const po = gettextParser.po.parse(poInput, 'UTF-8')
            for (const [msgctxt, potEntries] of Object.entries(pot.translations)) {
                for (const [msgid, potEntry] of Object.entries(potEntries)) {
                    if (msgctxt === '' && msgid === '') {
                        continue
                    }

                    if (msgctxt in po.translations && msgid in po.translations[msgctxt]) {
                        const poEntry = po.translations[msgctxt][msgid]
                        potEntry.msgstr = poEntry.msgstr
                    }
                }
            }
        }
        const output = gettextParser.po.compile(pot)
        fs.writeFileSync(poPath, output)
        await cleanupPo(domainName, poPath)
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

export function cleanupPot (domainName, potPath) {
    // POT-Creation-Date 항목이 자꾸 바뀌어서 diff 생기는 것 방지
    // 빈 주석, fuzzy 마크 지우기
    return execWithLog(
        `sed -i '' -E \
            ' \
                /^"POT-Creation-Date:/d; \
                /^#$/d; \
                /^#, fuzzy$/d; \
                s/^(#.*), fuzzy(.*)/\\1\\2/ \
            ' \
            "${potPath}"`,
        `[l10n:${domainName}] [cleanupPot]`
    )
}

export function cleanupPo (domainName, poPath) {
    // POT-Creation-Date 항목 제가 (쓸데없는 diff 방지)
    // 빈 주석, fuzzy 마크 지우기
    // source 주석 제거 (쓸데없는 diff 방지)
    // Language 항목 제대로 설정
    const language = path.basename(poPath, '.po')
    return execWithLog(
        `sed -i '' -E \
            ' \
                /^"POT-Creation-Date:/d; \
                /^#$/d; \
                /^#, fuzzy$/d; \
                s/^(#.*), fuzzy(.*)/\\1\\2/; \
                /^#:/d; \
                s/^"Content-Type: .*\\\\n"$/"Content-Type: text\\/plain; charset=UTF-8\\\\n"/; \
                s/^"Language: \\\\n"$/"Language: ${language}\\\\n"/ \
            ' \
            "${poPath}"`,
        `[l10n:${domainName}] [cleanupPo]`
    )
}
