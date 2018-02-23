import os from 'os'
import shell from 'shelljs'
import path from 'path'
import {cleanupPot, compilePoToMo, updatePo} from '../common'
import {syncPoToGoogleDocs} from '../google-docs-syncer'
import {execWithLog, requireCmd, getConfig} from '../utils'

async function extractPotFromPython (domainName, keywords, potPath, srcDirs) {
    await requireCmd.brew('xgettext', 'gettext', true)

    shell.mkdir('-p', path.dirname(potPath))

    console.info(`[l10n:${domainName}] [extractPotFromPython] from ${srcDirs.join(', ')}`)
    await execWithLog(
        `xgettext --language=Python \
            ${keywords.map(keyword => `--keyword="${keyword}"`).join(' ')} \
            --from-code=UTF-8 --no-wrap \
            --package-name="${domainName}" \
            --output="${potPath}" \
            $(find ${srcDirs.join(' ')} -name "*.py")`,
        `[l10n:${domainName}] [extractPotFromPython]`
    )
    console.info(`[l10n:${domainName}] [extractPotFromPython] done`)

    await cleanupPot(domainName, potPath)
}

async function runCommand (cmd, domainName, domain, googleDocs) {
    console.info(`[l10n:${domainName}] [${cmd}] start`)
    switch (cmd) {
        case '_extractPot': {
            const i18nDir = getConfig(domain, 'domains', 'i18n-dir')
            const srcDirs = getConfig(domain, 'domains', 'src-dirs')
            const keywords = getConfig(domain, 'domains', 'keywords')

            const potPath = path.join(i18nDir, domainName, 'template.pot')

            await extractPotFromPython(domainName, keywords, potPath, srcDirs)
            break
        }

        case '_updatePo': {
            const i18nDir = getConfig(domain, 'domains', 'i18n-dir')
            const locales = getConfig(domain, 'domains', 'locales')

            const potPath = path.join(i18nDir, domainName, 'template.pot')
            const poDir = path.join(i18nDir, domainName)

            await updatePo(domainName, potPath, poDir, locales)
            break
        }

        case '_apply': {
            const i18nDir = getConfig(domain, 'domains', 'i18n-dir')
            const targetDir = getConfig(domain, 'domains', 'target-dir')

            const poDir = path.join(i18nDir, domainName)

            await compilePoToMo(domainName, poDir, targetDir)
            break
        }

        case '_sync': {
            const i18nDir = getConfig(domain, 'domains', 'i18n-dir')
            const tag = getConfig(domain, 'domains', 'tag')

            const poDir = path.join(i18nDir, domainName)

            await syncPoToGoogleDocs(domainName, googleDocs, tag, poDir)
            break
        }

        case 'update': {
            const i18nDir = getConfig(domain, 'domains', 'i18n-dir')
            const srcDirs = getConfig(domain, 'domains', 'src-dirs')
            const locales = getConfig(domain, 'domains', 'locales')
            const targetDir = getConfig(domain, 'domains', 'target-dir')
            const keywords = getConfig(domain, 'domains', 'keywords')

            const potPath = path.join(i18nDir, domainName, 'template.pot')
            const poDir = path.join(i18nDir, domainName)

            await extractPotFromPython(domainName, keywords, potPath, srcDirs)
            await updatePo(domainName, potPath, poDir, locales)
            await compilePoToMo(domainName, poDir, targetDir)
            break
        }

        case 'upload': {
            const srcDirs = getConfig(domain, 'domains', 'src-dirs')
            const locales = getConfig(domain, 'domains', 'locales')
            const tag = getConfig(domain, 'domains', 'tag')
            const keywords = getConfig(domain, 'domains', 'keywords')

            const tempDir = path.join(os.tmpdir(), domainName)
            const potPath = path.join(tempDir, 'template.pot')
            const poDir = tempDir

            console.info(`[l10n:${domainName}] [${cmd}] temp dir: '${tempDir}'`)
            shell.rm('-rf', tempDir)
            await extractPotFromPython(domainName, keywords, potPath, srcDirs)
            await updatePo(domainName, potPath, poDir, locales)
            await syncPoToGoogleDocs(domainName, googleDocs, tag, poDir)
            shell.rm('-rf', tempDir)
            break
        }

        case 'sync': {
            const i18nDir = getConfig(domain, 'domains', 'i18n-dir')
            const srcDirs = getConfig(domain, 'domains', 'src-dirs')
            const locales = getConfig(domain, 'domains', 'locales')
            const targetDir = getConfig(domain, 'domains', 'target-dir')
            const tag = getConfig(domain, 'domains', 'tag')
            const keywords = getConfig(domain, 'domains', 'keywords')

            const potPath = path.join(i18nDir, domainName, 'template.pot')
            const poDir = path.join(i18nDir, domainName)

            await extractPotFromPython(domainName, keywords, potPath, srcDirs)
            await updatePo(domainName, potPath, poDir, locales)
            await syncPoToGoogleDocs(domainName, googleDocs, tag, poDir)
            await updatePo(domainName, potPath, poDir, locales)
            await compilePoToMo(domainName, poDir, targetDir)
            break
        }

        default:
            throw new Error(`unknown sub-command: ${cmd}`)
    }
    console.info(`[l10n:${domainName}] [${cmd}] done`)
}

module.exports = runCommand
