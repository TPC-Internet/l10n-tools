import {Extractor} from 'angular-gettext-tools'
import cheerio from 'cheerio'
import * as babylon from 'babylon'
import traverse from 'babel-traverse'
import fs from 'fs'
import glob from 'glob-promise'
import log from 'npmlog'
import {gettextToI18next} from 'i18next-conv'
import shell from 'shelljs'
import path from 'path'
import {cleanupPot, getDomainSrcPaths} from '../common'
import {getDomainConfig} from '../utils'
import jsonfile from 'jsonfile'

function getLine(src, index, startLine = 0) {
    const matches = src.substr(0, index).match(/\n/g)
    if (!matches) {
        return startLine
    }
    return startLine + matches.length
}

function getReference(filename, line) {
    return {
        file: filename,
        location: {
            start: {
                line: line
            }
        }
    }
}

function getReferenceByIndex(filename, src, index, startLine = 0) {
    return {
        file: filename,
        location: {
            start: {
                line: getLine(src, index, startLine) + 1
            }
        }
    }
}

Extractor.prototype.extractVue = function (filename, src, startLine = 0) {
    const $ = cheerio.load(src, {decodeEntities: false, withStartIndices: true})

    $('*').each((index, n) => {
        const node = $(n)
        if (n.name === 'script') {
            if (!('type' in n.attribs) || n.attribs.type === 'text/javascript') {
                this.extractVueJsModule(filename, n.children[0].data, getLine(src, n.children[0].startIndex, startLine))
            }
        } else if (n.name === 'translate') {
            const ref = getReferenceByIndex(filename, src, n.children[0].startIndex, startLine)
            const id = node.html().trim()
            const plural = n.attribs['translate-plural'] || null
            const comment = n.attribs['translate-comment'] || null
            const context = n.attribs['translate-context'] || null
            this.addString(ref, id, plural, comment, context)
        }

        if ('v-translate' in n.attribs) {
            const ref = getReferenceByIndex(filename, src, n.children[0].startIndex, startLine)
            const id = node.html().trim()
            const plural = n.attribs['translate-plural'] || null
            const comment = n.attribs['translate-comment'] || null
            const context = n.attribs['translate-context'] || null
            this.addString(ref, id, plural, comment, context)
        }

        for (const [attr, content] of Object.entries(n.attribs)) {
            if (attr.startsWith(':') || attr.startsWith('v-bind:') && content) {
                let contentIndex = 0
                const attrIndex = src.substr(n.startIndex).indexOf(attr)
                if (attrIndex >= 0) {
                    contentIndex = attrIndex + attr.length
                    while (/[=\s]/.test(src.substr(n.startIndex + contentIndex)[0])) {
                        contentIndex++
                    }
                    if (['\'', '"'].includes(src.substr(n.startIndex + contentIndex)[0])) {
                        contentIndex++
                    }
                }
                this.extractVueJsExpression(filename, content, getLine(src, n.startIndex + contentIndex, startLine))
            }
        }
    })
}

Extractor.prototype.extractVueJsModule = function (filename, src, startLine = 0) {
    const ast = babylon.parse(src, {
        sourceType: 'module',
        sourceFilename: filename,
        startLine: startLine + 1,
        plugins: ['objectRestSpread']
    })
    traverse(ast, {
        enter: path => {
            const node = path.node
            if (node.type === 'CallExpression') {
                if (node.callee.type === 'MemberExpression') {
                    if (node.callee.property.type === 'Identifier' && node.callee.property.name === '$gettext') {
                        const idArgument = node.arguments[0]
                        if (idArgument.type === 'StringLiteral') {
                            this.addString(getReference(filename, node.loc.start.line), idArgument.value, false, null, null)
                        }
                    }
                }
            }
        }
    })
}

Extractor.prototype.extractVueJsExpression = function (filename, src, startLine = 0) {
    const ast = babylon.parse('(' + src + ')', {
        sourceType: 'script',
        sourceFilename: filename,
        startLine: startLine + 1,
        plugins: ['objectRestSpread']
    })
    traverse(ast, {
        noScope: true,
        enter: path => {
            const node = path.node
            if (node.type === 'CallExpression') {
                if (node.callee.type === 'Identifier') {
                    if (node.callee.name === '$gettext') {
                        const idArgument = node.arguments[0]
                        if (idArgument.type === 'StringLiteral') {
                            this.addString(getReference(filename, node.loc.start.line), idArgument.value, false, null, null)
                        }
                    }
                }
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
        for (const srcPath of srcPaths) {
            log.info('extractPot', `processing '${srcPath}'`)
            const ext = path.extname(srcPath)
            if (ext === '.vue') {
                const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
                gettextExtractor.extractVue(srcPath, input)
            } else if (ext === '.js') {
                const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
                gettextExtractor.extractVueJsModule(srcPath, input)
            } else {
                log.warn('extractPot', `skipping unknown extension: '${ext}'`)
            }
        }
        fs.writeFileSync(potPath, gettextExtractor.toString())
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
