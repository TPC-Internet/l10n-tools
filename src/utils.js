import {spawn} from 'child_process'
import commandExists from 'command-exists'

export function execWithLog (cmd, logPrefix = '') {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, [], {shell: true})

        p.stdout.on('data', data => {
            for (const line of data.toString().split('\n')) {
                if (line) {
                    console.log(`${logPrefix} ${line}`)
                }
            }
        })

        p.stderr.on('data', data => {
            for (const line of data.toString().split('\n')) {
                if (line) {
                    console.warn(`${logPrefix} ${line}`)
                }
            }
        })

        p.on('close', code => {
            if (code === 0) {
                resolve(code)
            } else {
                reject(new Error(`process exited with code '${code}': ${cmd}`))
            }
        })
    })
}

export function getConfig (rc, prefix, name, defaultValue) {
    let value = null
    try {
        value = rc[prefix][name]
    } catch (err) {
        throw new Error(`config '${prefix}.${name}' is required`)
    }

    if (!value) {
        if (defaultValue === undefined) {
            throw new Error(`config '${prefix}.${name}' is required`)
        } else {
            return defaultValue
        }
    }
    return value
}

export function getDomainConfig (rc, domainName, name, defaultValue) {
    let value = null
    try {
        value = rc.domains[domainName][name]
    } catch (err) {
        throw new Error(`config 'domains.${domainName}.${name}' is required`)
    }

    if (!value) {
        if (defaultValue === undefined) {
            throw new Error(`config 'domains.${domainName}.${name}' is required`)
        } else {
            return defaultValue
        }
    }
    return value
}

export const requireCmd = {
    brew: requireBrewCmd
}

async function requireBrewCmd (cmd, pkg, needForceLink = false) {
    try {
        await commandExists(cmd)
    } catch (err) {
        if (needForceLink) {
            throw new Error(`install '${cmd}' by 'brew install ${pkg} && brew link --force ${pkg}' or else you like`)
        } else {
            throw new Error(`install '${cmd}' by 'brew install ${pkg}' or else you like`)
        }
    }
}
