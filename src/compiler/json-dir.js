import fs from 'fs'
import glob from 'glob-promise'
import {gettextToI18next} from 'i18next-conv'
import shell from 'shelljs'
import path from 'path'

export default async function (domainName, config, poDir) {
    const targetDir = config.get('target-dir')
    const useLocaleKey = config.get('use-locale-key', false)
    shell.mkdir('-p', targetDir)
    const poPaths = await glob.promise(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const json = await gettextToI18next(locale, fs.readFileSync(poPath), {
            keyseparator: false,
            skipUntranslated: true,
            ctxSeparator: false
        })
        const translations = JSON.parse(json)
        const jsonPath = path.join(targetDir, locale + '.json')
        if (useLocaleKey) {
            fs.writeFileSync(jsonPath, JSON.stringify({[locale]: translations}, null, 2))
        } else {
            fs.writeFileSync(jsonPath, JSON.stringify(translations, null, 2))
        }
    }
}
