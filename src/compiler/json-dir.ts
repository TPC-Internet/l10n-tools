import fs from 'fs'
import {glob} from 'glob'
import log from 'npmlog'
import * as shell from 'shelljs'
import * as path from 'path'
import {exportPoToJson} from '../po.js'
import {type CompilerConfig} from '../config.js'

export default async function (domainName: string, config: CompilerConfig, poDir: string) {
    const targetDir = config.getTargetDir()
    const useLocaleKey = config.useLocaleKey()
    const keySeparator = config.getKeySeparator()
    log.info('compile', `generating json files '${targetDir}/{locale}.json' (locale key: ${useLocaleKey})`)

    shell.mkdir('-p', targetDir)
    const poPaths = await glob(`${poDir}/*.po`)
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
