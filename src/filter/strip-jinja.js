import {handleMarker} from '../common'

export default function (domainName, config, src) {
    const variableMarker = config.get('variable-marker', {start: '{{', end: '}}'})
    src = stripJinjaOperation(src)
    return stripJinjaInterpolation(src, variableMarker)
}

function stripJinjaOperation (src) {
    let output = ''
    handleMarker(src, 0, {start: '{%', end: '%}'}, (inMarker, content) => {
        if (!inMarker) {
            output += content
            return
        }

        const lineMatches = content.match(/\n/g)
        const lineCount = lineMatches ? lineMatches.length : 0
        const blankCount = content.length - lineCount
        output += '\n'.repeat(lineCount) + ' '.repeat(blankCount)
    })
    return output
}

function stripJinjaInterpolation (src, marker) {
    let output = ''
    handleMarker(src, 0, marker, (inMarker, content) => {
        if (!inMarker) {
            output += content
            return
        }

        const lineMatches = content.match(/\n/g)
        const lineCount = lineMatches ? lineMatches.length : 0
        const blankCount = content.length - lineCount - 2
        return '{' + '\n'.repeat(lineCount) + ' '.repeat(blankCount) + '}'
    })
    return output
}
