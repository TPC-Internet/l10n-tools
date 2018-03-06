import {Extractor} from 'angular-gettext-tools'
import cheerio from 'cheerio'
import * as esprima from 'esprima'
import estraverse from 'estraverse'
import fs from 'fs'
import glob from 'glob-promise'
import log from 'npmlog'
import {gettextToI18next} from 'i18next-conv'
import shell from 'shelljs'
import path from 'path'
import {cleanupPot, getDomainSrcPaths, xgettext} from '../common'
import {getDomainConfig} from '../utils'
import jsonfile from 'jsonfile'

Extractor.prototype.extractBindAttrs = function (filename, src, lineNumber = 0) {
    const $ = cheerio.load(src, { decodeEntities: false, withStartIndices: true })

    const newlines = index => src.substr(0, index).match(/\n/g) || []
    const reference = index => {
        return {
            file: filename,
            location: {
                start: {
                    line: lineNumber + newlines(index).length + 1
                }
            }
        }
    }

    $('*').each((index, n) => {
        for (const [attr, content] of Object.entries($(n).attr())) {
            if (attr.startsWith(':') || attr.startsWith('v-bind:')) {
                const ast = esprima.parseScript(content)
                estraverse.traverse(ast, {
                    enter: node => {
                        if (node.type === 'CallExpression') {
                            if (node.callee.type === 'Identifier' && node.callee.name === '$gettext') {
                                const idArg = node.arguments[0]
                                if (idArg.type === 'Literal') {
                                    this.addString(reference(n.startIndex), idArg.value, false, null, null)
                                }
                            }
                        }
                    }
                })

            }
        }
    })
}

module.exports = {
    async extractPot(rc, domainName, potPath) {
        const srcPaths = await getDomainSrcPaths(rc, domainName, ['.vue', '.js'])

        shell.mkdir('-p', path.dirname(potPath))

        const vuePaths = []
        for (const srcPath of srcPaths) {
            if (path.extname(srcPath) === '.vue') {
                vuePaths.push(srcPath)
            }
        }

        const gettextExtractor = new Extractor({
            attributes: ['v-translate', 'translate'],
            extensions: {vue: 'html'}
        })
        log.info('extractPot', 'from vue templates')
        for (const vuePath of vuePaths) {
            log.info('extractPot', `processing '${vuePath}'`)
            const input = fs.readFileSync(vuePath, {encoding: 'UTF-8'})
            gettextExtractor.parse(vuePath, input)
            gettextExtractor.extractBindAttrs(vuePath, input)
        }
        fs.writeFileSync(potPath, gettextExtractor.toString())

        await xgettext(domainName, 'JavaScript', ['npgettext:1c,2,3'], potPath, srcPaths, true)
        cleanupPot(domainName, potPath)
    },

    async apply(rc, domainName, poDir) {
        const targetPath = getDomainConfig(rc, domainName, 'target-path')

        const translations = {}
        const poPaths = await glob.promise(`${poDir}/*.po`)
        for (const poPath of poPaths) {
            const locale = path.basename(poPath, '.po')
            const json = await gettextToI18next(locale, fs.readFileSync(poPath), {
                keyseparator: false,
                skipUntranslated: true,
                ctxSeparator: false
            })
            translations[locale] = JSON.parse(json)
        }
        jsonfile.writeFileSync(targetPath, translations, {spaces: 4})
    }
}
