import log from 'npmlog'
import * as path from 'path'
import fs from 'fs'
import jsonfile from 'jsonfile'
import {PotExtractor} from '../pot-extractor'

export default function (domainName, config, potPath) {
    const baseLocale = config.get('base-locale')
    const targetDir = config.get('target-dir')

    const baseJsonPath = path.join(targetDir, baseLocale + '.json')
    const extractor = PotExtractor.create(domainName)

    log.info('extractPot', `extracting from '${baseJsonPath}'`)
    const baseJson = jsonfile.readFileSync(baseJsonPath)
    for (const [ns, entries] of Object.entries(baseJson)) {
        for (const [key, value] of Object.entries(entries)) {
            const context = ns + '.' + key
            extractor.addMessage({}, value, {context})
        }
    }

    fs.writeFileSync(potPath, extractor.toString())
}
