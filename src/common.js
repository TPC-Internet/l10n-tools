import path from 'path'
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
                s/^"Language: \\\\n"$/"Language: ${language}\\\\n"/ \
            ' \
            "${poPath}"`,
        `[l10n:${domainName}] [cleanupPo]`
    )
}
