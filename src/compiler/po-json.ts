import fs from 'fs'
import {glob} from 'glob'
import log from 'npmlog'
import shell from 'shelljs'
import * as path from 'path'
import {readPoFile} from '../po.js'
import {type CompilerConfig} from '../config.js'

export default async function (domainName: string, config: CompilerConfig, poDir: string) {
    const targetDir = config.getTargetDir()
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
