import log from 'npmlog'

export class ValidateError extends Error {}
export class UnexpectedFormatError extends ValidateError {}
export class FormatNotFoundError extends ValidateError {}
export class NotEnoughFormatError extends ValidateError {}
export class UnmatchedFormatError extends ValidateError {}
export class TooManyFormatError extends ValidateError {}

type FormatDef = {
    name: string
    type: string
    regex: RegExp
}

const formatDefs: FormatDef[] = [
    {name: 'C', type: 'c-format', regex: /%-?[0-9]*\.?[0-9]*(?:c|d|e|E|f|g|G|hi|hu|i|l|ld|li|lf|Lf|lu|lli|lld|llu|o|p|s|u|x|X|n|@)/g},
    {name: 'Ordered C', type: 'c-format-ordered', regex: /%[1-9]+\$-?[0-9]*\.?[0-9]*(?:c|d|e|E|f|g|G|hi|hu|i|l|ld|li|lf|Lf|lu|lli|lld|llu|o|p|s|u|x|X|n|@)/g},
    {name: 'Named', type: 'single-bracket-named', regex: /\{[A-Za-z_][A-Za-z0-9_]*}/g}
]

export function validateMsgFormat(msgid: string, msgstr: string) {
    if (!msgstr.trim()) {
        return
    }
    log.verbose('validate', `|${msgid.replace('\n', '\\n')}| vs |${msgstr.replace('\n', '\\n')}|`)
    for (const def of formatDefs) {
        validateFormat(msgid, msgstr, def)
    }
}

function validateFormat(msgid: string, msgstr: string, def: FormatDef) {
    const expectedFormats = msgid.match(def.regex)
    const formats = msgstr.match(def.regex)
    if (expectedFormats == null) {
        if (formats != null) {
            throw new UnexpectedFormatError(`unexpected ${def.name} format found`)
        }
        return
    }
    if (formats == null) {
        throw new FormatNotFoundError(`${def.name} format not found`)
    }

    const uniqueExpectedFormats = [...new Set(expectedFormats)].sort()
    const uniqueFormats = [...new Set(formats)].sort()
    if (uniqueExpectedFormats.length != uniqueFormats.length) {
        throw new NotEnoughFormatError(`${def.name} format count not matched`)
    }
    if (def.type === 'c-format') {
        if (uniqueExpectedFormats.length > 1) {
            throw new TooManyFormatError(`use order parameter in c-format to use more then one format`)
        }
    }
    for (const [i, expectedFormat] of uniqueExpectedFormats.entries()) {
        if (expectedFormat != uniqueFormats[i]) {
            throw new UnmatchedFormatError(`unmatched ${def.name} format ${expectedFormat} - ${formats[i]}`)
        }
    }
}
