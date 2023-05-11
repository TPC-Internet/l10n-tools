import cheerio from 'cheerio'
import log from 'npmlog'
import {findPoEntry, PoEntryBuilder, setPoEntry} from './po.js'
import * as gettextParser from 'gettext-parser'
import ts from 'typescript'
import php from 'php-parser'
import fs from 'fs'
import path from 'path'
import {type GetTextTranslation, type GetTextTranslations} from 'gettext-parser'
import {type TemplateMarker} from './common.js'
import {fileURLToPath} from 'url';

export type PotExtractorOptions = {
    keywords: string[] | Set<string>
    tagNames: string[]
    attrNames: string[]
    valueAttrNames: string[]
    objectAttrs: {[name: string]: string[]}
    filterNames: string[]
    markers: TemplateMarker[]
    exprAttrs: RegExp[]
}

type KeywordDef = {
    objectName: string | null
    position: number
    propName: string
}

export class PotExtractor {
    public readonly po: GetTextTranslations
    private options: PotExtractorOptions
    private readonly keywordDefs: KeywordDef[]
    private readonly keywordMap: {[keyword: string]: number}

    constructor (po: GetTextTranslations, options: Partial<PotExtractorOptions>) {
        this.po = po
        this.options = Object.assign<PotExtractorOptions, Partial<PotExtractorOptions>>({
            keywords: [],
            tagNames: [],
            attrNames: [],
            valueAttrNames: [],
            objectAttrs: {},
            filterNames: [],
            markers: [],
            exprAttrs: [],
        }, options)

        this.keywordDefs = [...this.options.keywords].map(keyword => parseKeyword(keyword))
        this.keywordMap = buildKeywordMap(this.options.keywords)
    }

    static create (domainName: string, options: Partial<PotExtractorOptions>) {
        const dirname = path.dirname(fileURLToPath(import.meta.url))
        const pkg = JSON.parse(fs.readFileSync(path.join(dirname, '..', 'package.json'), 'utf-8'))
        return new PotExtractor({
            charset: 'utf-8',
            headers: {
                'Project-Id-Version': domainName,
                'Mime-Version': '1.0',
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Transfer-Encoding': '8bit',
                'X-Generator': `l10n-tools ${pkg.version}`
            },
            translations: {}
        }, options)
    }

    extractJsIdentifierNode (filename: string, src: string, ast: ts.SourceFile, startLine = 1) {
        const visit = (node: ts.Node) => {
            if (ts.isExpressionStatement(node)) {
                const pos = findNonSpace(src, node.pos)
                try {
                    const ids = this._evaluateTsArgumentValues(node.expression)
                    for (const id of ids) {
                        this.addMessage({filename, line: getLineTo(src, pos, startLine)}, id)
                    }
                    return
                } catch (err: any) {
                    log.warn('extractJsObjectNode', err.message)
                    log.warn('extractJsObjectNode', `'${src.substring(pos, node.end)}': (${filename}:${getLineTo(src, pos, startLine)})`)
                }
            }
            ts.forEachChild(node, visit)
        }
        visit(ast)
    }

    extractJsObjectNode (filename: string, src: string, ast: ts.SourceFile, paths: string[], startLine: number = 1) {
        const visit = (node: ts.Node) => {
            if (ts.isExpressionStatement(node)) {
                const pos = findNonSpace(src, node.pos)
                const errs: any[] = []
                for (const path of paths) {
                    try {
                        const ids = this._evaluateTsArgumentValues(node.expression, path)
                        for (const id of ids) {
                            this.addMessage({filename, line: getLineTo(src, pos, startLine)}, id)
                        }
                        return
                    } catch (err: any) {
                        errs.push(err)
                    }
                }
                if (errs.length > 0) {
                    for (const err of errs) {
                        log.warn('extractJsObjectNode', err.message)
                    }
                    log.warn('extractJsObjectNode', `'${src.substring(pos, node.end)}': (${filename}:${getLineTo(src, pos, startLine)})`)
                }
            }
            ts.forEachChild(node, visit)
        }
        visit(ast)
    }

    extractJsModule (filename: string, src: string, startLine: number = 1) {
        try {
            const ast = ts.createSourceFile(filename, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
            this.extractTsNode(filename, src, ast, startLine)
        } catch (err: any) {
            log.warn('extractJsModule', `error parsing '${src.split(/\n/g)[err.loc.line - 1].trim()}' (${filename}:${err.loc.line})`)
        }
    }

    extractReactJsModule (filename: string, src: string, startLine: number = 1) {
        try {
            const ast = ts.createSourceFile(filename, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
            this.extractTsNode(filename, src, ast, startLine)
        } catch (err: any) {
            log.warn('extractReactJsModule', `error parsing '${src.split(/\n/g)[err.loc.line - 1].trim()}' (${filename}:${err.loc.line})`)
        }
    }

    extractVue (filename: string, src: string, startLine: number = 1) {
        const $ = cheerio.load(src, {decodeEntities: false, withStartIndices: true})

        $.root().children().each((index, elem) => {
            if (!isTagElement(elem)) {
                return
            }
            if (elem.children.length === 0) {
                return
            }

            if (elem.name === 'template') {
                const content = $(elem).html()
                if (content) {
                    const line = getLineTo(src, elem.children[0].startIndex!, startLine)
                    this.extractTemplate(filename, content, line)
                }
            } else if (elem.name === 'script') {
                const content = $(elem).html()
                if (content) {
                    const {lang, type} = elem.attribs
                    if (lang === 'ts') {
                        const line = getLineTo(src, elem.children[0].startIndex!, startLine)
                        this.extractTsModule(filename, content, line)
                    } else if (!type || type === 'text/javascript') {
                        const line = getLineTo(src, elem.children[0].startIndex!, startLine)
                        this.extractJsModule(filename, content, line)
                    }
                }
            }
        })
    }

    extractTemplate (filename: string, src: string, startLine: number = 1) {
        const $ = cheerio.load(src, {decodeEntities: false, withStartIndices: true})

        $('*').each((index, elem) => {
            const node = $(elem)

            if (!isTagElement(elem)) {
                return
            }

            if (elem.name === 'script') {
                const content = $(elem).html()
                if (content) {
                    const type = elem.attribs.type
                    if (!type || type === 'text/javascript') {
                        const line = getLineTo(src, elem.children[0].startIndex!, startLine)
                        this.extractJsModule(filename, content, line)
                    } else if (type === 'text/ng-template') {
                        const line = getLineTo(src, elem.children[0].startIndex!, startLine)
                        this.extractTemplate(filename, content, line)
                    }
                }
            }

            if (this.options.tagNames.includes(elem.name)) {
                if (elem.name === 'translate') {
                    const id = node.html()?.trim()
                    if (id) {
                        const line = getLineTo(src, elem.children[0].startIndex!, startLine)
                        const plural = elem.attribs['translate-plural'] || null
                        const comment = elem.attribs['translate-comment'] || null
                        const context = elem.attribs['translate-context'] || null
                        this.addMessage({filename, line}, id, {plural, comment, context})
                    }
                } else if (elem.name === 'i18n') {
                    if ('path' in elem.attribs) {
                        const id = elem.attribs['path']
                        if (id) {
                            const line = getLineTo(src, elem.startIndex!, startLine)
                            this.addMessage({filename, line}, id)
                        }
                    } else if (':path' in elem.attribs) {
                        const source = elem.attribs[':path']
                        if (source) {
                            const line = getLineTo(src, elem.startIndex!, startLine)
                            this.extractJsIdentifier(filename, source, line)
                        }
                    }
                } else if (elem.name === 'i18n-t') {
                    if ('keypath' in elem.attribs) {
                        const id = elem.attribs['keypath']
                        if (id) {
                            const line = getLineTo(src, elem.startIndex!, startLine)
                            this.addMessage({filename, line}, id)
                        }
                    } else if (':keypath' in elem.attribs) {
                        const source = elem.attribs[':keypath']
                        if (source) {
                            const line = getLineTo(src, elem.startIndex!, startLine)
                            this.extractJsIdentifier(filename, source, line)
                        }
                    }
                }
            }

            if (this.options.attrNames.some(attrName => elem.attribs.hasOwnProperty(attrName))) {
                const id = node.html()?.trim()
                if (id) {
                    const line = getLineTo(src, elem.children[0].startIndex!, startLine)
                    const plural = elem.attribs['translate-plural'] || null
                    const comment = elem.attribs['translate-comment'] || null
                    const context = elem.attribs['translate-context'] || null
                    this.addMessage({filename, line}, id, {plural, comment, context})
                }
            }

            for (const [attr, content] of Object.entries(elem.attribs)) {
                if (content) {
                    if (this.options.exprAttrs.some(pattern => attr.match(pattern))) {
                        let contentIndex = 0
                        const attrIndex = src.substr(elem.startIndex!).indexOf(attr)
                        if (attrIndex >= 0) {
                            contentIndex = attrIndex + attr.length
                            while (/[=\s]/.test(src.substr(elem.startIndex! + contentIndex)[0])) {
                                contentIndex++
                            }
                            if (['\'', '"'].includes(src.substr(elem.startIndex! + contentIndex)[0])) {
                                contentIndex++
                            }
                        }
                        const line = getLineTo(src, elem.startIndex! + contentIndex, startLine)
                        this.extractJsExpression(filename, content, line)
                    } else if (this.options.valueAttrNames.some(pattern => attr.match(pattern))) {
                        let contentIndex = 0
                        const attrIndex = src.substr(elem.startIndex!).indexOf(attr)
                        if (attrIndex >= 0) {
                            contentIndex = attrIndex + attr.length
                            while (/[=\s]/.test(src.substr(elem.startIndex! + contentIndex)[0])) {
                                contentIndex++
                            }
                            if (['\'', '"'].includes(src.substr(elem.startIndex! + contentIndex)[0])) {
                                contentIndex++
                            }
                        }
                        const line = getLineTo(src, elem.startIndex! + contentIndex, startLine)
                        this.extractJsIdentifier(filename, content, line)
                    } else if (Object.keys(this.options.objectAttrs).includes(attr)) {
                        let contentIndex = 0
                        const attrIndex = src.substr(elem.startIndex!).indexOf(attr)
                        if (attrIndex >= 0) {
                            contentIndex = attrIndex + attr.length
                            while (/[=\s]/.test(src.substr(elem.startIndex! + contentIndex)[0])) {
                                contentIndex++
                            }
                            if (['\'', '"'].includes(src.substr(elem.startIndex! + contentIndex)[0])) {
                                contentIndex++
                            }
                        }
                        const line = getLineTo(src, elem.startIndex! + contentIndex, startLine)
                        this.extractJsObjectPaths(filename, content, this.options.objectAttrs[attr], line)
                    }
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

    extractMarkerExpression (filename: string, src: string, marker: TemplateMarker, startLine = 1) {
        if (!marker.type || marker.type === 'js') {
            this.extractJsExpression(filename, src, startLine)
        }
    }

    extractJsExpression (filename: string, src: string, startLine: number = 1) {
        try {
            const ast = ts.createSourceFile(filename, `(${src})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
            this.extractTsNode(filename, src, ast, startLine)
        } catch (err: any) {
            log.warn('extractJsExpression', `error parsing '${src.split(/\n/g)[err.loc.line - 1].trim()}' (${filename}:${err.loc.line})`)
        }
    }

    extractJsIdentifier (filename: string, src: string, startLine: number = 1) {
        try {
            const ast = ts.createSourceFile(filename, `(${src})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
            this.extractJsIdentifierNode(filename, src, ast, startLine)
        } catch (err: any) {
            log.warn('extractJsIdentifier', `error parsing '${src.split(/\n/g)[err.loc.line - 1].trim()}' (${filename}:${err.loc.line})`)
        }
    }

    extractJsObjectPaths (filename: string, src: string, paths: string[], startLine: number = 1) {
        try {
            const ast = ts.createSourceFile(filename, `(${src})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
            this.extractJsObjectNode(filename, src, ast, paths, startLine)
        } catch (err: any) {
            log.warn('extractJsObjectPaths', `error parsing '${src.split(/\n/g)[err.loc.line - 1].trim()}' (${filename}:${err.loc.line})`)
        }
    }

    _evaluateTsArgumentValues (node: ts.Expression, path = ''): string[] {
        if (ts.isParenthesizedExpression(node)) {
            return this._evaluateTsArgumentValues(node.expression, path)
        }
        if (path) {
            if (ts.isObjectLiteralExpression(node)) {
                for (const prop of node.properties) {
                    if (!ts.isPropertyAssignment(prop)) {
                        continue
                    }
                    if (!ts.isIdentifier(prop.name)) {
                        continue
                    }
                    if (prop.name.escapedText !== path) {
                        continue
                    }
                    return this._evaluateTsArgumentValues(prop.initializer)
                }
                throw new Error(`cannot extract translations from '${node.kind}' node, no ${path} property`)
            } else {
                throw new Error(`cannot extract translations from '${node.kind}' node, use string literal directly`)
            }
        } else {
            if (ts.isStringLiteral(node)) {
                return [node.text]
            } else if (ts.isIdentifier(node)) {
                throw new Error('cannot extract translations from variable, use string literal directly')
            } else if (ts.isPropertyAccessExpression(node)) {
                throw new Error('cannot extract translations from variable, use string literal directly')
            } else if (ts.isBinaryExpression(node) && ts.isPlusToken(node.operatorToken)) {
                const values = []
                for (const leftValue of this._evaluateTsArgumentValues(node.left)) {
                    for (const rightValue of this._evaluateTsArgumentValues(node.right)) {
                        values.push(leftValue + rightValue)
                    }
                }
                return values
            } else if (ts.isConditionalExpression(node)) {
                return this._evaluateTsArgumentValues(node.whenTrue)
                    .concat(this._evaluateTsArgumentValues(node.whenFalse))
            } else {
                throw new Error(`cannot extract translations from '${node.kind}' node, use string literal directly`)
            }
        }
    }

    _getTsCalleeName(node: ts.Node): string | null {
        if (ts.isIdentifier(node)) {
            return node.text
        }

        if (node.kind === ts.SyntaxKind.ThisKeyword) {
            return 'this'
        }

        if (ts.isPropertyAccessExpression(node)) {
            const obj = this._getTsCalleeName(node.expression)
            const prop = this._getTsCalleeName(node.name)
            if (obj == null || prop == null) {
                return null
            }
            return obj + '.' + prop
        }

        return null
    }

    extractTsNode (filename: string, src: string, ast: ts.SourceFile, startLine: number = 1) {
        const visit = (node: ts.Node) => {
            if (ts.isCallExpression(node)) {
                const pos = findNonSpace(src, node.pos)
                const calleeName = this._getTsCalleeName(node.expression)
                if (calleeName != null && this.keywordMap.hasOwnProperty(calleeName)) {
                    try {
                        const position = this.keywordMap[calleeName]
                        const ids = this._evaluateTsArgumentValues(node.arguments[position])
                        for (const id of ids) {
                            this.addMessage({filename, line: getLineTo(src, pos, startLine)}, id)
                        }
                    } catch (err: any) {
                        log.warn('extractTsNode', err.message)
                        log.warn('extractTsNode', `'${src.substring(pos, node.end)}': (${filename}:${getLineTo(src, pos, startLine)})`)
                    }
                }
            } else if (ts.isObjectLiteralExpression(node)) {
                for (const prop of node.properties) {
                    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'template') {
                        const template = prop.initializer
                        if (ts.isNoSubstitutionTemplateLiteral(template)) {
                            this.extractTemplate(filename, template.text, getLineTo(src, template.pos, startLine))
                        }
                    }
                }
            }
            ts.forEachChild(node, visit)
        }
        visit(ast)
    }

    extractTsModule (filename: string, src: string, startLine: number = 1) {
        try {
            const ast = ts.createSourceFile(filename, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
            this.extractTsNode(filename, src, ast, startLine)
        } catch (err: any) {
            log.warn('extractTsModule', `error parsing '${src.split(/\n/g)[err.loc.line - 1].trim()}' (${filename}:${err.loc.line})`)
        }
    }

    _evaluatePhpArgumentValues (node: php.Node): string[] {
        if (node instanceof php.String) {
            return [node.value]
        } else if (node instanceof php.Encapsed) {
            throw new Error('cannot extract translations from interpolated string, use sprintf for formatting')
        } else if (node instanceof php.Variable) {
            throw new Error('cannot extract translations from variable, use string literal directly')
        } else if (node instanceof php.PropertyLookup) {
            throw new Error('cannot extract translations from variable, use string literal directly')
        } else if (node instanceof php.Bin && node.type === '+') {
            const values = []
            for (const leftValue of this._evaluatePhpArgumentValues(node.left)) {
                for (const rightValue of this._evaluatePhpArgumentValues(node.right)) {
                    values.push(leftValue + rightValue)
                }
            }
            return values
        } else if (node instanceof php.RetIf) {
            return this._evaluatePhpArgumentValues(node.trueExpr)
                .concat(this._evaluatePhpArgumentValues(node.falseExpr))
        } else {
            throw new Error(`cannot extract translations from '${node.kind}' node, use string literal directly`)
        }
    }

    extractPhpNode (filename: string, src: string, ast: php.Program) {
        const visit = (node: php.Node) => {
            if (node instanceof php.Call) {
                for (const {propName, position} of this.keywordDefs) {
                    if (node.what.kind === 'classreference') {
                        if (node.what.name === propName) {
                            const startOffset = src.substr(0, node.loc!.start.offset).lastIndexOf(propName)
                            try {
                                const ids = this._evaluatePhpArgumentValues(node.arguments[position])
                                for (const id of ids) {
                                    this.addMessage({filename, line: node.loc!.start.line}, id)
                                }
                            } catch (err: any) {
                                log.warn('extractPhpNode', err.message)
                                log.warn('extractPhpNode', `'${src.substring(startOffset, node.loc!.end.offset)}': (${filename}:${node.loc!.start.line})`)
                            }
                        }
                    }
                }
            }

            for (const key in node) {
                // noinspection JSUnfilteredForInLoop
                // @ts-ignore
                const value = node[key]
                if (Array.isArray(value)) {
                    for (const child of value) {
                        if (child instanceof php.Node) {
                            visit(child)
                        }
                    }
                } else if (value instanceof php.Node) {
                    visit(value)
                }
            }
        }
        visit(ast)
    }

    extractPhpCode (filename: string, src: string, startLine: number = 1) {
        const parser = new php.Engine({
            parser: {
                extractDoc: true,
                locations: true,
                php7: true
            },
            ast: {
                withPositions: true
            }
        })

        try {
            const ast = parser.parseCode(src, filename)
            this.extractPhpNode(filename, src, ast)
        } catch (err: any) {
            log.warn('extractPhpCode', `error parsing '${src.split(/\n/g)[err.loc.line - 1].trim()}' (${filename}:${err.loc.line})`)
        }
    }

    addMessage ({filename, line}: {filename: string, line: number | string}, id: string,
                options?: { plural?: string | null, comment?: string | null, context?: string | null, allowSpaceInId?: boolean }) {
        const {plural = null, comment = null, context = null, allowSpaceInId = false} = options ?? {}
        const poEntry = findPoEntry(this.po, context, id)
        const builder = poEntry ? PoEntryBuilder.fromPoEntry(poEntry) : new PoEntryBuilder(context, id, {allowSpaceInId})

        builder.addReference(filename, line)
        if (plural) {
            builder.setPlural(plural)
        }
        if (comment) {
            builder.addComment(comment)
        }

        setPoEntry(this.po, builder.toPoEntry())
    }

    toString (): Buffer {
        function compareMsgctxt(left: string | undefined, right: string | undefined) {
            if (left && right) {
                if (left < right)
                    return -1
                if (left > right)
                    return 1
                return 0
            } else {
                if (right)
                    return -1
                if (left)
                    return 1
                return 0
            }
        }

        function compareMsgid(left: string, right: string) {
            if (left < right)
                return -1
            if (left > right)
                return 1
            return 0
        }

        function sort(left: GetTextTranslation, right: GetTextTranslation) {
            const order = compareMsgid(left.msgid, right.msgid)
            if (order !== 0)
                return order
            return compareMsgctxt(left.msgctxt, right.msgctxt)
        }

        return gettextParser.po.compile(this.po, {sort})
    }
}

function parseKeyword(keyword: string): KeywordDef {
    const [name, _pos] = keyword.split(':')
    const position = _pos ? Number.parseInt(_pos) : 0
    const [name1, name2] = name.split('.')
    if (name2) {
        return {
            objectName: name1,
            propName: name2,
            position: position
        }
    } else {
        return {
            objectName: null,
            propName: name1,
            position: position
        }
    }
}

function buildKeywordMap(keywords: string[] | Set<string>): {[keyword: string]: number} {
    const keywordMap: {[keyword: string]: number} = {}
    for (const keyword of keywords) {
        const [name, pos] = keyword.split(':')
        keywordMap[name] = pos ? Number.parseInt(pos) : 0
    }
    return keywordMap
}

function findNonSpace(src: string, index: number): number {
    const match = /^(\s*)\S/.exec(src.substring(index))
    if (match) {
        return index + match[1].length
    } else {
        return index
    }
}

export function getLineTo(src: string, index: number, startLine: number = 1): number {
    const matches = src.substr(0, index).match(/\n/g)
    if (!matches) {
        return startLine
    }
    return startLine + matches.length
}

export function isTagElement(elem: cheerio.Element): elem is cheerio.TagElement {
    return ['tag', 'script', 'style'].includes(elem.type)
}
