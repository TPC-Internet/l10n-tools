import fs from 'fs'
import glob from 'glob-promise'
import log from 'npmlog'
import * as shell from 'shelljs'
import path from 'path'
import {exportPoToJson} from '../po'

export default async function (domainName, config, poDir) {
    const targetDir = config.get('target-dir')
    const useLocaleKey = config.get('use-locale-key', false)
    const keySeparator = config.get('key-separator', false)
    log.info('compile', `generating json files '${targetDir}/{locale}.json' (locale key: ${useLocaleKey})`)

    shell.mkdir('-p', targetDir)
    const poPaths = await glob.promise(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const json = exportPoToJson(poPath, {keySeparator})
        const jsonPath = path.join(targetDir, locale + '.json')
        if (useLocaleKey) {
            fs.writeFileSync(jsonPath, JSON.stringify({[locale]: json}, null, 2))
        } else {
            fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2))
        }
    }
}
