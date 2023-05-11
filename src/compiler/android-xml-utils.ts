import {XMLBuilder, XMLParser} from 'fast-xml-parser';

type Alphabet =
    'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' |
    'k' | 'l' | 'm' | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' |
    'u' | 'v' | 'w' | 'x' | 'y' | 'z'
type XMLNodeList = XMLNode[]

export type XMLNode = XMLTextNode | XMLCDataNode | XMLTagNode

export type XMLTextNode = {
    '#text': string
}

export type XMLCDataNode = {
    '#cdata': [{
        '#text': string
    }]
}

export type XMLTagNode = {
    [tagName: `${Alphabet}${string}`]: XMLNodeList,
    ':@'?: {
        [nameKey: `@_${string}`]: string
    }
}

export function getAndroidXmlParser(): XMLParser {
    return new XMLParser({
        ignoreAttributes: false,
        alwaysCreateTextNode: true,
        preserveOrder: true,
        trimValues: false,
        cdataPropName: '#cdata'
    })
}

export function getAndroidXmlBuilder(): XMLBuilder {
    return new XMLBuilder({
        ignoreAttributes: false,
        preserveOrder: true,
        processEntities: false,
        cdataPropName: '#cdata'
    })
}

export function parseAndroidXml(parser: XMLParser, src: string): XMLNodeList {
    let srcJson = parser.parse(src) as any[]
    for (const [i, child] of srcJson.entries()) {
        if (child['?xml']) {
            srcJson.splice(i + 1, 0, {'#text': '\n'})
            break
        }
    }
    return srcJson
}

export function buildAndroidXml(builder: XMLBuilder, xmlJson: XMLNodeList): string {
    return builder.build(xmlJson)
}

export function findFirstTagNode(nodeList: XMLNodeList, tagName: string, attrs?: {[attrName: string]: string}): XMLTagNode | null {
    for (const node of nodeList) {
        if (isTagNode(node, tagName)) {
            if (attrs != null) {
                for (const [attrName, attrValue] of Object.entries(attrs)) {
                    if (getAttrValue(node, attrName) != attrValue) {
                        return null
                    }
                }
            }
            return node
        }
    }
    return null
}

export function isTextNode(node: XMLNode): node is XMLTextNode {
    return '#text' in node
}

export function isCDataNode(node: XMLNode): node is XMLCDataNode {
    return '#cdata' in node
}

export function isTagNode(node: XMLNode, tagName: string): node is XMLTagNode {
    return tagName in node
}

export function getAttrValue(node: XMLTagNode, attrName: string): string | null {
    return node[':@']?.[`@_${attrName}`] ?? null
}

export function encodeAndroidStrings(value: string): string {
    value = value.replace(/[\n'"@]/g, m => {
        switch (m) {
            case '"':
            case '\'':
            case '@':
                return '\\' + m
            case '\n':
                return '\\n'
            default:
                throw new Error(`unknown android escape code: ${m}`)
        }
    })
    if (value.match(/(^\s|\s$)/)) {
        value = '"' + value + '"'
    }
    return value
}

export function containsAndroidXmlSpecialChars(value: string): boolean {
    return /[<>&]/.test(value)
}