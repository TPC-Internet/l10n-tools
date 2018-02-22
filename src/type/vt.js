import fs from 'fs'
import gettextParser from 'gettext-parser'
import glob from 'glob-promise'
import os from 'os'
import shell from 'shelljs'
import path from 'path'
import {cleanupPot, compilePoToMo, updatePo} from '../common'
import {syncPoToGoogleDocs} from '../google-docs-syncer'
import {requireCmd, getConfig} from '../utils'

async function extractPotFromVt (domainName, potPath, srcDirs) {
    await requireCmd.brew('xgettext', 'gettext', true)

    shell.mkdir('-p', path.dirname(potPath))

    const translations = {'': {}}
    for (const srcDir of srcDirs) {
        const htmlPaths = await glob.promise(`${srcDir}/**/*.html`)
        for (const htmlPath of htmlPaths) {
            console.info(`[l10n:${domainName}] [extractPotFromVt] processing ${htmlPath}`)
            const html = fs.readFileSync(htmlPath, 'UTF-8')
            const regex = /{%trans ([^%]+)%}|(\n)/g
            let lineNo = 1
            while (true) {
                const match = regex.exec(html)
                if (!match) {
                    break
                }
                if (match[1]) {
                    // console.log(`matched at ${lineNo}: ${match[1]}`)
                    translations[''][match[1]] = {
                        comments: {
                            reference: htmlPath + ':' + lineNo
                        },
                        msgid: match[1],
                        msgstr: ['']
                    }
                } else if (match[2]) {
                    lineNo++
                }
            }
        }

    }

    // console.log('translations', JSON.stringify(translations, null, 2))
    const output = gettextParser.po.compile({
        charset: 'UTF-8',
        headers: {
            'Project-Id-Version': domainName,
            'Language': '',
            'MIME-Version': '1.0',
            'Content-Type': 'text/plain; charset=UTF-8',
            'Content-Transfer-Encoding': '8bit'
        },
        translations: translations
    })
    fs.writeFileSync(potPath, output)
    await cleanupPot(domainName, potPath)
}

async function runCommand (cmd, domainName, domain, googleDocs) {
    console.info(`[l10n:${domainName}] [${cmd}] start`)
    switch (cmd) {
        case '_extractPot': {
            const i18nDir = getConfig(domain, 'domains', 'i18n-dir')
            const srcDirs = getConfig(domain, 'domains', 'src-dirs')

            const potPath = path.join(i18nDir, domainName, 'template.pot')

            await extractPotFromVt(domainName, potPath, srcDirs)
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

            const potPath = path.join(i18nDir, domainName, 'template.pot')
            const poDir = path.join(i18nDir, domainName)

            await extractPotFromVt(domainName, potPath, srcDirs)
            await updatePo(domainName, potPath, poDir, locales)
            await compilePoToMo(domainName, poDir, targetDir)
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
            await extractPotFromVt(domainName, potPath, srcDirs)
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

            const potPath = path.join(i18nDir, domainName, 'template.pot')
            const poDir = path.join(i18nDir, domainName)

            await extractPotFromVt(domainName, potPath, srcDirs)
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
