import fs from 'fs'
import glob from 'glob-promise'
import log from 'npmlog'
import path from 'path'
import {Compiler} from 'angular-gettext-tools'

export default async function (domainName, config, poDir) {
    const targetDir = config.get('target-dir')
    log.info('compile', `generating js files to '${targetDir}/{locale}.js'`)
    const gettextCompiler = new Compiler({format: 'javascript'})
    const poPaths = await glob.promise(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const input = fs.readFileSync(poPath, {encoding: 'UTF-8'})
        const output = gettextCompiler.convertPo([input])
        const jsTargetPath = path.join(targetDir, locale + '.js')
        fs.writeFileSync(jsTargetPath, output)
    }
}
