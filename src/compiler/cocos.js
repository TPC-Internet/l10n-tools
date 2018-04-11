import fs from 'fs'
import glob from 'glob-promise'
import {gettextToI18next} from 'i18next-conv'
import log from 'npmlog'
import * as shell from 'shelljs'
import path from 'path'

export default async function (domainName, config, poDir) {
    const targetDir = config.get('target-dir')
    log.info('compile', `generating json files '${targetDir}/{locale}.js'`)

    shell.mkdir('-p', targetDir)
    const poPaths = await glob.promise(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const json = await gettextToI18next(locale, fs.readFileSync(poPath), {
            keyseparator: '.',
            skipUntranslated: true,
            ctxSeparator: false
        })
        const translations = JSON.parse(json)
        const targetPath = path.join(targetDir, locale + '.js')
        if (!fs.existsSync(targetPath)) {
            log.error('compile', `create file '${targetPath}' manually by 'Cocos Creator > Extension > i18n menu' `)
            continue
        }
        fs.writeFileSync(targetPath, `'use strict';

if (!window.i18n) {
    window.i18n = {};
}

if (!window.i18n.languages) {
    window.i18n.languages = {};
}

window.i18n.languages['${locale}'] = ${JSON.stringify(translations, null, 4)};
`)
    }
}
