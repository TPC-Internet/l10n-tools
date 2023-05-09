import {glob} from 'glob'
import log from 'npmlog'
import * as path from 'path'
import jsonfile from 'jsonfile'
import {exportPoToJson, type PoJson} from '../po.js'
import {type CompilerConfig} from '../config.js'

export default async function (domainName: string, config: CompilerConfig, poDir: string) {
    const targetPath = config.getTargetPath()
    log.info('compile', `generating json file to '${targetPath}'`)

    const translations: {[locale: string]: PoJson} = {}
    const poPaths = await glob(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        translations[locale] = exportPoToJson(poPath, {keySeparator: null})
    }
    jsonfile.writeFileSync(targetPath, translations, {spaces: 2})
}
