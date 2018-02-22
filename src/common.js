import fs from 'fs'
import gettextParser from 'gettext-parser'
import glob from 'glob-promise'
import path from 'path'
import shell from 'shelljs'
import {execWithLog, requireCmd} from './utils'

export async function updatePo (domainName, potPath, poDir, locales) {
    await requireCmd.pip('pot2po', 'translate-toolkit')

    for (const locale of locales) {
        const poFile = locale + '.po'
        const poPath = path.join(poDir, poFile)
        await execWithLog(
            `pot2po --nofuzzymatching -t "${poPath}" "${potPath}" "${poPath}"`,
            `[l10n:${domainName}] [updatePo:${locale}]`
        )
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
