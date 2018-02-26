import fs from 'fs'
import glob from 'glob-promise'
import shell from 'shelljs'
import log from 'npmlog'
import path from 'path'
import {cleanupPot, getDomainSrcPaths} from '../common'
import {getDomainConfig} from '../utils'
import {Compiler, Extractor} from 'angular-gettext-tools'

module.exports = {
    async extractPot(rc, domainName, potPath) {
        const srcPaths = await getDomainSrcPaths(rc, domainName, ['.html', '.js'])

        shell.mkdir('-p', path.dirname(potPath))

        log.info('extractPot', 'from angular gettext')
        const gettextExtractor = new Extractor()
        for (const srcPath of srcPaths) {
            const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'});
            gettextExtractor.parse(srcPath, input)
        }
        fs.writeFileSync(potPath, gettextExtractor.toString())
        await cleanupPot(domainName, potPath)
    },

    async apply(rc, domainName, poDir) {
        const targetDir = getDomainConfig(rc, domainName, 'target-dir', null)
        const jsTargetDir = getDomainConfig(rc, domainName, 'js-target-dir', null)
        if (targetDir == null && jsTargetDir == null) {
            throw new Error(`config 'domains.${domainName}.target-dir' or 'domains.${domainName}.js-target-dir' is required`)
        }

        if (targetDir != null) {
            log.info('apply', `generating json files to ${targetDir}`)
            const gettextCompiler = new Compiler({format: 'json'})
            const poPaths = await glob.promise(`${poDir}/*.po`)
            for (const poPath of poPaths) {
                const locale = path.basename(poPath, '.po')
                const input = fs.readFileSync(poPath, {encoding: 'UTF-8'})
                const output = gettextCompiler.convertPo([input])
                const targetPath = path.join(targetDir, locale + '.json')
                fs.writeFileSync(targetPath, output)
            }
        }

        if (jsTargetDir != null) {
            log.info('apply', `generating js files to ${jsTargetDir}`)
            const gettextCompiler = new Compiler({format: 'javascript'})
            const poPaths = await glob.promise(`${poDir}/*.po`)
            for (const poPath of poPaths) {
                const locale = path.basename(poPath, '.po')
                const input = fs.readFileSync(poPath, {encoding: 'UTF-8'})
                const output = gettextCompiler.convertPo([input])
                const jsTargetPath = path.join(jsTargetDir, locale + '.js')
                fs.writeFileSync(jsTargetPath, output)
            }
        }
    }
}
