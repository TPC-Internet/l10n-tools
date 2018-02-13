import path from 'path'
import os from 'os'
import shell from 'shelljs'
import {updatePo} from '../common'
import {getConfig} from '../utils'
import {syncContextPoToGoogleDocs, syncPoToGoogleDocs} from '../google-docs-syncer'
import fs from 'fs'
import gettextParser from 'gettext-parser'
import jsonfile from 'jsonfile'
import glob from 'glob-promise'

function convertCordovaJsonToPot (domainName, locale, potPath, targetDir) {
    shell.mkdir('-p', path.dirname(potPath))

    const translations = {}

    const baseJsonFile = path.join(targetDir, locale + '.json')
    const baseJson = jsonfile.readFileSync(baseJsonFile)
    for (const [ns, entries] of Object.entries(baseJson)) {
        for (const [key, value] of Object.entries(entries)) {
            const context = ns + '.' + key
            translations[context] = {
                [value]: {
                    msgctxt: context,
                    msgid: value,
                    msgstr: ''
                }
            }
        }
    }

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
}

async function compilePoToCordovaJson (domainName, baseLocale, poDir, targetDir) {
    shell.mkdir('-p', targetDir)
    const poPaths = await glob.promise(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const input = fs.readFileSync(poPath)
        const {translations} = gettextParser.po.parse(input)
        const json = {}
        for (const data of Object.values(translations)) {
            const entry = Object.values(data)[0]
            if (!('msgctxt' in entry) && entry.msgid === '') {
                continue
            }

            if (entry.msgstr.length > 1) {
                throw new Error('unknown po format')
            }

            const [ns, key] = entry.msgctxt.split('.', 2)
            let value = entry.msgstr[0]
            if (!value && locale === baseLocale) {
                value = entry.msgid
            }

            if (!(ns in json)) {
                json[ns] = {}
            }
            json[ns][key] = value
        }
        const jsonPath = path.join(targetDir, locale + '.json')
        jsonfile.writeFileSync(jsonPath, json, {spaces: 4})
    }
}

async function runCommand (cmd, domainName, domain, googleDocs) {
    console.info(`[l10n:${domainName}] [${cmd}] start`)
    switch (cmd) {
        case '_extractPot': {
            const i18nDir = getConfig(domain, 'domains', 'i18n-dir')
            const baseLocale = getConfig(domain, 'domains', 'base-locale')
            const targetDir = getConfig(domain, 'domains', 'target-dir')

            const potPath = path.join(i18nDir, domainName, 'template.pot')

            convertCordovaJsonToPot(domainName, baseLocale, potPath, targetDir)
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
            const baseLocale = getConfig(domain, 'domains', 'base-locale')
            const targetDir = getConfig(domain, 'domains', 'target-dir')

            const poDir = path.join(i18nDir, domainName)

            compilePoToCordovaJson(domainName, baseLocale, poDir, targetDir)
            break
        }

        case '_sync': {
            const i18nDir = getConfig(domain, 'domains', 'i18n-dir')
            const tag = getConfig(domain, 'domains', 'tag')

            const poDir = path.join(i18nDir, domainName)

            await syncContextPoToGoogleDocs(domainName, googleDocs, tag, poDir)
            break
        }

        case 'update': {
            const i18nDir = getConfig(domain, 'domains', 'i18n-dir')
            const baseLocale = getConfig(domain, 'domains', 'base-locale')
            const locales = getConfig(domain, 'domains', 'locales')
            const targetDir = getConfig(domain, 'domains', 'target-dir')

            const potPath = path.join(i18nDir, domainName, 'template.pot')
            const poDir = path.join(i18nDir, domainName)

            convertCordovaJsonToPot(domainName, baseLocale, potPath, targetDir)
            await updatePo(domainName, potPath, poDir, locales)
            await compilePoToCordovaJson(domainName, baseLocale, poDir, targetDir)
            break
        }

        case 'upload': {
            const baseLocale = getConfig(domain, 'domains', 'base-locale')
            const locales = getConfig(domain, 'domains', 'locales')
            const tag = getConfig(domain, 'domains', 'tag')
            const targetDir = getConfig(domain, 'domains', 'target-dir')

            const tempDir = path.join(os.tmpdir(), domainName)
            const potPath = path.join(tempDir, 'template.pot')
            const poDir = tempDir

            console.info(`[l10n:${domainName}] [${cmd}] temp dir: '${tempDir}'`)
            shell.rm('-rf', tempDir)
            convertCordovaJsonToPot(domainName, baseLocale, potPath, targetDir)
            await updatePo(domainName, potPath, poDir, locales)
            await syncPoToGoogleDocs(domainName, googleDocs, tag, poDir)
            shell.rm('-rf', tempDir)
            break
        }

        case 'sync': {
            const i18nDir = getConfig(domain, 'domains', 'i18n-dir')
            const baseLocale = getConfig(domain, 'domains', 'base-locale')
            const locales = getConfig(domain, 'domains', 'locales')
            const targetDir = getConfig(domain, 'domains', 'target-dir')
            const tag = getConfig(domain, 'domains', 'tag')

            const potPath = path.join(i18nDir, domainName, 'template.pot')
            const poDir = path.join(i18nDir, domainName)

            convertCordovaJsonToPot(domainName, baseLocale, potPath, targetDir)
            await updatePo(domainName, potPath, poDir, locales)
            await syncPoToGoogleDocs(domainName, googleDocs, tag, poDir)
            await updatePo(domainName, potPath, poDir, locales)
            await compilePoToCordovaJson(domainName, baseLocale, poDir, targetDir)
            break
        }

        default:
            throw new Error(`unknown sub-command: ${cmd}`)
    }
    console.info(`[l10n:${domainName}] [${cmd}] done`)
}

module.exports = runCommand
