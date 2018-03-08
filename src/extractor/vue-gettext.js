import {Extractor} from 'angular-gettext-tools'
import cheerio from 'cheerio'
import * as babylon from 'babylon'
import createBabylonOptions from 'babylon-options'
import traverse from 'babel-traverse'
import fs from 'fs'
import log from 'npmlog'
import shell from 'shelljs'
import path from 'path'
import {getSrcPaths} from '../common'

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
            if ((attr.startsWith(':') || attr.startsWith('v-bind:')) && content) {
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
    const ast = babylon.parse(src, createBabylonOptions({
        sourceType: 'module',
        sourceFilename: filename,
        startLine: startLine + 1,
        stage: 0
    }))
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
    const ast = babylon.parse('(' + src + ')', createBabylonOptions({
        sourceType: 'script',
        sourceFilename: filename,
        startLine: startLine + 1,
        stage: 0
    }))
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

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.vue', '.js'])

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
}
