import log from 'npmlog'
import * as shell from "shelljs"
import {glob} from 'glob'
import * as path from "path"
import jsonfile from 'jsonfile'
import {readPoFile} from "../po"

export default async function (domainName, config, poDir) {
    const targetDir = config.get('target-dir')
    log.info('compile', `generating json files to '${targetDir}/${domainName}/{locale}.json'`)
    shell.mkdir('-p', targetDir)
    const poPaths = await glob(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const jsonDir = path.join(targetDir, domainName)
        const jsonPath = path.join(jsonDir, locale + '.json')
        const po = readPoFile(poPath)

        shell.mkdir('-p', jsonDir)
        jsonfile.writeFileSync(jsonPath, po, {spaces: 2})
    }
}
