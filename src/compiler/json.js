import fs from 'fs'
import glob from 'glob-promise'
import {gettextToI18next} from 'i18next-conv'
import path from 'path'
import jsonfile from 'jsonfile'

export default async function (domainName, config, poDir) {
    const targetPath = config.get('target-path')

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
    jsonfile.writeFileSync(targetPath, translations, {spaces: 2})
}
