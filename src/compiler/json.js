import {glob} from 'glob'
import log from 'npmlog'
import * as path from 'path'
import jsonfile from 'jsonfile'
import {exportPoToJson} from '../po'

export default async function (domainName, config, poDir) {
    const targetPath = config.get('target-path')
    log.info('compile', `generating json file to '${targetPath}'`)

    const translations = {}
    const poPaths = await glob(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        translations[locale] = exportPoToJson(poPath, {keySeparator: false})
    }
    jsonfile.writeFileSync(targetPath, translations, {spaces: 2})
}
