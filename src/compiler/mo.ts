import log from 'npmlog'
import shell from "shelljs"
import {glob} from 'glob'
import * as path from "path"
import {readPoFile} from '../po.js'
import * as gettextParser from "gettext-parser"
import fs from "fs"
import {type CompilerConfig} from '../config.js'

export default async function (domainName: string, config: CompilerConfig, poDir: string) {
    const targetDir = config.getTargetDir()
    log.info('compile', `generating mo files to '${targetDir}/{locale}/LC_MESSAGES/${domainName}.mo'`)
    shell.mkdir('-p', targetDir)
    const poPaths = await glob(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const moDir = path.join(targetDir, locale, 'LC_MESSAGES')
        const moPath = path.join(moDir, domainName + '.mo')

        const po = readPoFile(poPath)
        const output = gettextParser.mo.compile(po)

        shell.mkdir('-p', moDir)
        fs.writeFileSync(moPath, output)
    }
}
