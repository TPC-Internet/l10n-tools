import cheerio from 'cheerio'
import createBabylonOptions from 'babylon-options'
import * as babylon from 'babylon'
import traverse from 'babel-traverse'
import {getPoEntry, PoEntryBuilder, setPoEntry} from './po'
import * as gettextParser from 'gettext-parser'

export class JsExtractor {
    constructor (po, options) {
        this.po = po
        this.options = Object.assign({
            keywords: [],
            tagNames: [],
            attrNames: [],
            markers: [],
            exprAttrs: []
        }, options)
    }

    static create (domainName, options) {
        return new JsExtractor({
            charset: 'utf-8',
            headers: {
                'project-id-version': domainName,
                'mime-version': '1.0',
                'content-type': 'text/plain; charset=utf-8',
                'content-transfer-encoding': '8bit'
            },
            translations: {}
        }, options)
    }

    extractJsModule (filename, src, startLine = 1) {
        const ast = babylon.parse(src, createBabylonOptions({
            sourceType: 'module',
            sourceFilename: filename,
            startLine: startLine,
            stage: 0
        }))
        traverse(ast, {
            enter: path => {
                const node = path.node
                if (node.type === 'CallExpression') {
                    if (node.callee.type === 'Identifier') {
                        if (this.options.keywords.includes(node.callee.name)) {
                            const idArgument = node.arguments[0]
                            if (idArgument.type === 'StringLiteral') {
                                this.addMessage({filename, line: node.loc.start.line}, idArgument.value)
                            }
                        }
                    } else if (node.callee.type === 'MemberExpression') {
                        if (node.callee.property.type === 'Identifier' && this.options.keywords.includes(node.callee.property.name)) {
                            const idArgument = node.arguments[0]
                            if (idArgument.type === 'StringLiteral') {
                                this.addMessage({filename, line: node.loc.start.line}, idArgument.value)
                            }
                        }
                    }
                }
            }
        })
    }

    extractTemplate (filename, src, startLine = 1) {
        const $ = cheerio.load(src, {decodeEntities: false, withStartIndices: true})

        $('*').each((index, elem) => {
            const node = $(elem)
            if (elem.name === 'script') {
                const type = elem.attribs.type
                if (!type || type === 'text/javascript') {
                    const content = elem.children[0].data
                    const line = getLineTo(src, elem.children[0].startIndex, startLine)
                    this.extractJsModule(filename, content, line)
                }
            } else if (this.options.tagNames.includes(elem.name)) {
                const line = getLineTo(src, elem.children[0].startIndex, startLine)
                const id = node.html().trim()
                const plural = elem.attribs['translate-plural'] || null
                const comment = elem.attribs['translate-comment'] || null
                const context = elem.attribs['translate-context'] || null
                this.addMessage({filename, line}, id, plural, comment, context)
            }

            if (this.options.attrNames.some(attrName => attrName in elem.attribs)) {
                const line = getLineTo(src, elem.children[0].startIndex, startLine)
                const id = node.html().trim()
                const plural = elem.attribs['translate-plural'] || null
                const comment = elem.attribs['translate-comment'] || null
                const context = elem.attribs['translate-context'] || null
                this.addMessage({filename, line}, id, plural, comment, context)
            }

            for (const [attr, content] of Object.entries(elem.attribs)) {
                if (content && this.options.exprAttrs.some(pattern => attr.match(pattern))) {
                    let contentIndex = 0
                    const attrIndex = src.substr(elem.startIndex).indexOf(attr)
                    if (attrIndex >= 0) {
                        contentIndex = attrIndex + attr.length
                        while (/[=\s]/.test(src.substr(elem.startIndex + contentIndex)[0])) {
                            contentIndex++
                        }
                        if (['\'', '"'].includes(src.substr(elem.startIndex + contentIndex)[0])) {
                            contentIndex++
                        }
                    }
                    const line = getLineTo(src, elem.startIndex + contentIndex, startLine)
                    this.extractJsExpression(filename, content, line)
                }
            }

            for (const child of elem.children) {
                if (child.type === 'text') {
                    for (const marker of this.options.markers) {
                        let data = child.data
                        let dataIndex = 0
                        while (data) {
                            let startOffset = data.indexOf(marker.start)
                            if (startOffset === -1)
                                break

                            startOffset += marker.start.length
                            const endOffset = data.substr(startOffset).indexOf(marker.end)
                            const content = data.substr(startOffset, endOffset)
                            const line = getLineTo(src, child.startIndex + dataIndex + startOffset, startLine)
                            this.extractJsExpression(filename, content, line)

                            dataIndex += startOffset + endOffset + marker.end.length
                            data = child.data.substr(dataIndex)
                        }
                    }
                }
            }
        })
    }

    extractJsExpression (filename, src, startLine = 1) {
        const ast = babylon.parse('(' + src + ')', createBabylonOptions({
            sourceType: 'script',
            sourceFilename: filename,
            startLine: startLine,
            stage: 0
        }))
        traverse(ast, {
            enter: path => {
                const node = path.node
                if (node.type === 'CallExpression') {
                    if (node.callee.type === 'Identifier') {
                        if (this.options.keywords.includes(node.callee.name)) {
                            const idArgument = node.arguments[0]
                            if (idArgument.type === 'StringLiteral') {
                                this.addMessage({filename, line: node.loc.start.line}, idArgument.value)
                            }
                        }
                    } else if (node.callee.type === 'MemberExpression') {
                        if (node.callee.property.type === 'Identifier' && this.options.keywords.includes(node.callee.property.name)) {
                            const idArgument = node.arguments[0]
                            if (idArgument.type === 'StringLiteral') {
                                this.addMessage({filename, line: node.loc.start.line}, idArgument.value)
                            }
                        }
                    }
                }
            }
        })
    }

    addMessage ({filename, line}, id, plural = null, comment = null, context = null) {
        const poEntry = getPoEntry(this.po, context, id)
        const builder = poEntry ? PoEntryBuilder.fromPoEntry(poEntry) : new PoEntryBuilder(context, id)

        builder.addReference(filename, line)
        if (plural) {
            builder.setPlural(plural)
        }
        if (comment) {
            builder.addComment(comment)
        }

        setPoEntry(this.po, builder.toPoEntry())
    }

    getPo () {
        return this.po
    }

    toString () {
        return gettextParser.po.compile(this.po, {sortByMsgid: true})
    }
}

function getLineTo(src, index, startLine = 1) {
    const matches = src.substr(0, index).match(/\n/g)
    if (!matches) {
        return startLine
    }
    return startLine + matches.length
}
