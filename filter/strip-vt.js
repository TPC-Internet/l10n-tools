import {handleMarker} from '../common'

export default function (domainName, config, src) {
    const marker = getVtInterpolateMarker(src)
    let output = src.substring(0, marker.dataOffset)
    handleMarker(src, marker.dataOffset, marker, (inMarker, content) => {
        if (!inMarker) {
            output += content
            return
        }

        const lineMatches = content.match(/\n/g)
        const lineCount = lineMatches ? lineMatches.length : 0
        const blankCount = content.length - lineCount - 2
        output += '{' + '\n'.repeat(lineCount) + ' '.repeat(blankCount) + '}'
    })
    return output
}

function getVtInterpolateMarker (src) {
    const match = /<\?vt-config\s+\binterpolate-marker="([^"]+)".*>/.exec(src)
    if (match == null) {
        return {start: '{{', end: '}}', dataOffset: 0}
    }

    let [start, end] = match[1].split(',')
    if (!end) {
        end = start
    }

    return {start, end, dataOffset: match[0].length}
}
