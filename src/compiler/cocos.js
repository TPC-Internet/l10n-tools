import fs from 'fs'
import glob from 'glob-promise'
import log from 'npmlog'
import * as shell from 'shelljs'
import path from 'path'
import {exportPoToJson} from '../po'

export default async function (domainName, config, poDir) {
    const targetDir = config.get('target-dir')
    log.info('compile', `generating json files '${targetDir}/{locale}.js'`)

    shell.mkdir('-p', targetDir)
    const poPaths = await glob.promise(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const json = exportPoToJson(poPath, {keySeparator: '.'})
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

window.i18n.languages['${locale}'] = ${JSON.stringify(json, null, 4)};
`)
    }
}
