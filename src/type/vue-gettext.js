import fs from 'fs'
import glob from 'glob-promise'
import {gettextToI18next} from 'i18next-conv/lib/index'
import os from 'os'
import shell from 'shelljs'
import path from 'path'
import {cleanupPot, updatePo} from '../common'
import {syncPoToGoogleDocs} from '../google-docs-syncer'
import {execWithLog, requireCmd, getConfig} from '../utils'

async function extractPot (domainName, potPath, srcDirs) {
    await requireCmd.npm('gettext-extract', 'easygettext')
    await requireCmd.brew('xgettext', 'gettext', true)

    shell.mkdir('-p', path.dirname(potPath))
    await execWithLog(
        `npx gettext-extract --attribute v-translate --quiet \
            --output "${potPath}" \
            $(find ${srcDirs.join(' ')} -name "*.vue")`,
        `[l10n:${domainName}] [extractPot]`
    )

    await execWithLog(
        `xgettext --language=JavaScript --keyword=npgettext:1c,2,3 \
            --from-code=utf-8 --join-existing --no-wrap \
            --package-name="${domainName}" \
            --output="${potPath}" \
            $(find ${srcDirs.join(' ')} -name "*.js" -o -name "*.vue")`,
        `[l10n:${domainName}] [extractPot]`
    )

    await cleanupPot(domainName, potPath)
}

async function compilePoToJson (domainName, poDir, targetPath) {
    const translations = {}
    const poPaths = await glob.promise(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const json = await gettextToI18next(locale, fs.readFileSync(poPath), {
            keyseparator: false,
            skipUntranslated: true,
            ctxSeparator: false
        })
        translations[locale] = JSON.parse(json)
    }
    fs.writeFileSync(targetPath, JSON.stringify(translations, null, 4))
}

async function runCommand (cmd, domainName, domain, googleDocs) {
    console.info(`[l10n:${domainName}] [${cmd}] start`)
    switch (cmd) {
        case '_extractPot': {
            const i18nDir = getConfig(domain, 'domains', 'i18n-dir')
            const srcDirs = getConfig(domain, 'domains', 'src-dirs')

            const potPath = path.join(i18nDir, domainName, 'template.pot')

            await extractPot(domainName, potPath, srcDirs)
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
            const targetPath = getConfig(domain, 'domains', 'target-path')

            const poDir = path.join(i18nDir, domainName)

            await compilePoToJson(domainName, poDir, targetPath)
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
            const targetPath = getConfig(domain, 'domains', 'target-path')

            const potPath = path.join(i18nDir, domainName, 'template.pot')
            const poDir = path.join(i18nDir, domainName)

            await extractPot(domainName, potPath, srcDirs)
            await updatePo(domainName, potPath, poDir, locales)
            await compilePoToJson(domainName, poDir, targetPath)
            break
        }

        case 'upload': {
            const srcDirs = getConfig(domain, 'domains', 'src-dirs')
            const locales = getConfig(domain, 'domains', 'locales')
            const tag = getConfig(domain, 'domains', 'tag')

            const tempDir = path.join(os.tmpdir(), domainName)
            const potPath = path.join(tempDir, 'template.pot')
            const poDir = tempDir

            console.info(`[l10n:${domainName}] [${cmd}] temp dir: '${tempDir}'`)
            shell.rm('-rf', tempDir)
            await extractPot(domainName, potPath, srcDirs)
            await updatePo(domainName, potPath, poDir, locales)
            await syncPoToGoogleDocs(domainName, googleDocs, tag, poDir)
            shell.rm('-rf', tempDir)
            break
        }

        case 'sync': {
            const i18nDir = getConfig(domain, 'domains', 'i18n-dir')
            const srcDirs = getConfig(domain, 'domains', 'src-dirs')
            const locales = getConfig(domain, 'domains', 'locales')
            const targetPath = getConfig(domain, 'domains', 'target-path')
            const tag = getConfig(domain, 'domains', 'tag')

            const potPath = path.join(i18nDir, domainName, 'template.pot')
            const poDir = path.join(i18nDir, domainName)

            await extractPot(domainName, potPath, srcDirs)
            await updatePo(domainName, potPath, poDir, locales)
            await syncPoToGoogleDocs(domainName, googleDocs, tag, poDir)
            await updatePo(domainName, potPath, poDir, locales)
            await compilePoToJson(domainName, poDir, targetPath)
            break
        }

        default:
            throw new Error(`unknown sub-command: ${cmd}`)
    }
    console.info(`[l10n:${domainName}] [${cmd}] done`)
}

module.exports = runCommand
