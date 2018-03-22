import cheerio from 'cheerio'
import createBabylonOptions from 'babylon-options'
import * as babylon from 'babylon'
import log from 'npmlog'
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
            filterNames: [],
            markers: [],
            exprAttrs: []
        }, options)

        this.filterExprs = this.options.filterNames.map(filterName => {
            return new RegExp('^(.*)\\|\\s*' + filterName)
        })
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

    _getArgumentValues (node) {
        if (node.type === 'StringLiteral') {
            return [node.value]
        } else if (node.type === 'Identifier') {
            throw new Error('cannot extract translations from variable, use string literal directly')
        } else if (node.type === 'MemberExpression') {
            throw new Error('cannot extract translations from variable, use string literal directly')
        } else if (node.type === 'BinaryExpression' && node.operator === '+') {
            const values = []
            for (const leftValue of this._getArgumentValues(node.left)) {
                for (const rightValue of this._getArgumentValues(node.right)) {
                    values.push(leftValue + rightValue)
                }
            }
            return values
        } else if (node.type === 'ConditionalExpression') {
            return this._getArgumentValues(node.consequent)
                .concat(this._getArgumentValues(node.alternate))
        } else {
            throw new Error(`cannot extract translations from '${node.type}' node, use string literal directly`)
        }
    }

    extractJs (filename, src, ast) {
        traverse(ast, {
            enter: path => {
                const node = path.node
                if (node.type === 'CallExpression') {
                    for (const keyword of this.options.keywords) {
                        const dotIndex = keyword.indexOf('.')
                        if (dotIndex >= 0) {
                            if (node.callee.type === 'MemberExpression') {
                                const objectName = keyword.substring(0, dotIndex)
                                const propName = keyword.substring(dotIndex + 1)
                                if ((objectName === 'this' && node.callee.object.type === 'ThisExpression')
                                    || (node.callee.object.type === 'Identifier' && node.callee.object.name === objectName)) {
                                    if (node.callee.property.type === 'Identifier' && node.callee.property.name === propName) {
                                        try {
                                            const ids = this._getArgumentValues(node.arguments[0])
                                            for (const id of ids) {
                                                this.addMessage({filename, line: node.loc.start.line}, id)
                                            }
                                        } catch (err) {
                                            log.warn('extractJs', err.message)
                                            log.warn('extractJs', `'${src.substring(node.start, node.end)}': (${node.loc.filename}:${node.loc.start.line})`)
                                        }
                                    }
                                }
                            }
                        } else {
                            if (node.callee.type === 'Identifier') {
                                if (node.callee.name === keyword) {
                                    try {
                                        const ids = this._getArgumentValues(node.arguments[0])
                                        for (const id of ids) {
                                            this.addMessage({filename, line: node.loc.start.line}, id)
                                        }
                                    } catch (err) {
                                        log.warn('extractJs', err.message)
                                        log.warn('extractJs', `'${src.substring(node.start, node.end)}': (${node.loc.filename}:${node.loc.start.line})`)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })
    }

    extractJsModule (filename, src, startLine = 1) {
        try {
            const ast = babylon.parse(src, createBabylonOptions({
                sourceType: 'module',
                sourceFilename: filename,
                startLine: startLine,
                stage: 0
            }))
            this.extractJs(filename, src, ast)
        } catch (err) {
            log.warn('extractJsModule', `error parsing '${src.split(/\n/g)[err.loc.line - 1].trim()}' (${filename}:${startLine})`)
        }
    }

    extractVue (filename, src, startLine = 1) {
        const $ = cheerio.load(src, {decodeEntities: false, withStartIndices: true})

        $.root().children().each((index, elem) => {
            if (elem.children.length === 0) {
                return
            }

            if (elem.name === 'template') {
                const content = $(elem).html()
                if (content) {
                    const line = getLineTo(src, elem.children[0].startIndex, startLine)
                    this.extractTemplate(filename, content, line)
                }
            } else if (elem.name === 'script') {
                const content = $(elem).html()
                if (content) {
                    const type = elem.attribs.type
                    if (!type || type === 'text/javascript') {
                        const line = getLineTo(src, elem.children[0].startIndex, startLine)
                        this.extractJsModule(filename, content, line)
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
                const content = $(elem).html()
                if (content) {
                    const type = elem.attribs.type
                    if (!type || type === 'text/javascript') {
                        const line = getLineTo(src, elem.children[0].startIndex, startLine)
                        this.extractJsModule(filename, content, line)
                    } else if (type === 'text/ng-template') {
                        const line = getLineTo(src, elem.children[0].startIndex, startLine)
                        this.extractTemplate(filename, content, line)
                    }
                }
            }

            if (this.options.tagNames.includes(elem.name)) {
                const id = node.html().trim()
                if (id) {
                    const line = getLineTo(src, elem.children[0].startIndex, startLine)
                    const plural = elem.attribs['translate-plural'] || null
                    const comment = elem.attribs['translate-comment'] || null
                    const context = elem.attribs['translate-context'] || null
                    this.addMessage({filename, line}, id, plural, comment, context)
                }
            }

            if (this.options.attrNames.some(attrName => attrName in elem.attribs)) {
                const id = node.html().trim()
                if (id) {
                    const line = getLineTo(src, elem.children[0].startIndex, startLine)
                    const plural = elem.attribs['translate-plural'] || null
                    const comment = elem.attribs['translate-comment'] || null
                    const context = elem.attribs['translate-context'] || null
                    this.addMessage({filename, line}, id, plural, comment, context)
                }
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
        })

        for (const marker of this.options.markers) {
            let srcIndex = 0
            while (true) {
                let startOffset = src.indexOf(marker.start, srcIndex)
                if (startOffset === -1) {
                    break
                }

                startOffset += marker.start.length
                const endOffset = src.indexOf(marker.end, startOffset)
                if (endOffset === -1) {
                    srcIndex = startOffset
                    continue
                }

                const content = src.substring(startOffset, endOffset)
                const line = getLineTo(src, startOffset, startLine)
                this.extractMarkerExpression(filename, content, marker, line)

                srcIndex = endOffset + marker.end.length
            }
        }
    }

    extractMarkerExpression (filename, src, marker, startLine = 1) {
        if (!marker.type || marker.type === 'js') {
            this.extractJsExpression(filename, src, startLine)
        } else if (marker.type === 'angular') {
            this.extractAngularExpression(filename, src, startLine)
        }
    }

    extractJsExpression (filename, src, startLine = 1) {
        try {
            const ast = babylon.parse(src, createBabylonOptions({
                sourceType: 'script',
                sourceFilename: filename,
                startLine: startLine,
                stage: 0
            }))
            this.extractJs(filename, src, ast)
        } catch (err) {
            log.warn('extractJsExpression', `error parsing '${src}' (${filename}:${startLine})`, err)
        }
    }

    extractAngularExpression (filename, src, startLine = 1) {
        for (const filterExpr of this.filterExprs) {
            const match = filterExpr.exec(src)
            if (match == null) {
                continue
            }

            const contentExpr = match[1]
            try {
                const node = babylon.parseExpression(contentExpr, createBabylonOptions({
                    sourceType: 'script',
                    sourceFilename: filename,
                    startLine: startLine,
                    stage: 0
                }))
                try {
                    const ids = this._getArgumentValues(node)
                    for (const id of ids) {
                        this.addMessage({filename, line: node.loc.start.line}, id)
                    }
                } catch (err) {
                    log.warn('extractAngularExpression', err.message)
                    log.warn('extractAngularExpression', `${src}: (${node.loc.filename}:${node.loc.start.line})`)
                }
            } catch (err) {
                log.warn('extractAngularExpression', `cannot extract from '${src}' (${filename}:${startLine})`)
            }
        }
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
