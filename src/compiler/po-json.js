import fs from 'fs'
import {glob} from 'glob'
import log from 'npmlog'
import * as shell from 'shelljs'
import * as path from 'path'
import {readPoFile} from '../po'

export default async function (domainName, config, poDir) {
    const targetDir = config.get('target-dir')
    log.info('compile', `generating po-json files '${targetDir}/{locale}.json'`)

    shell.mkdir('-p', targetDir)
    const poPaths = await glob(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const json = readPoFile(poPath)
        const jsonPath = path.join(targetDir, locale + '.json')
        fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2))
    }
}
