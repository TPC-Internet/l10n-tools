import log from 'npmlog'
import path from 'path'
import * as shell from 'shelljs'
import jsonfile from 'jsonfile'
import glob from 'glob-promise'
import {getPoEntriesFromFile} from '../po'

export default async function(domainName, config, poDir) {
    const baseLocale = config.get('base-locale')
    const targetDir = config.get('target-dir')
    log.info('compile', `generating cordova json files to '${targetDir}/{locale}.json'`)

    shell.mkdir('-p', targetDir)
    const poPaths = await glob.promise(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const json = {}
        for (const poEntry of getPoEntriesFromFile(poPath)) {
            if (poEntry.msgstr.length > 1) {
                throw new Error('unknown po format')
            }

            const [ns, key] = poEntry.msgctxt.split('.', 2)
            let value = poEntry.msgstr[0]
            if (!value && locale === baseLocale) {
                value = poEntry.msgid
            }

            if (!json.hasOwnProperty(ns)) {
                json[ns] = {}
            }

            if (value) {
                json[ns][key] = value
            }
        }
        const jsonPath = path.join(targetDir, locale + '.json')
        jsonfile.writeFileSync(jsonPath, json, {spaces: 2})
    }
}
