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
                console.warn(`cmd: ${cmd}`)
                reject(new Error(`process exited with code '${code}'`))
            }
        })
    })
}

export function getConfig (config, prefix, name) {
    const value = config[name]
    if (!value) {
        throw new Error(`config '${prefix}.${name}' is required`)
    }
    return value
}

export const requireCmd = {
    npm: requireNpmCmd,
    brew: requireBrewCmd,
    pip: requirePipCmd,
    pipFromGitHub: requirePipFromGitHubCmd
}

async function requireNpmCmd (cmd, pkg, needGlobal) {
    try {
        await commandExists(cmd)
    } catch (err) {
        if (needGlobal) {
            throw new Error(`install '${cmd}' by 'npm install -g ${pkg}'`)
        } else {
            throw new Error(`install '${cmd}' by 'npm install ${pkg}'`)
        }
    }
}

async function requireBrewCmd (cmd, pkg, needForceLink) {
    try {
        await commandExists(cmd)
    } catch (err) {
        if (needForceLink) {
            throw new Error(`install '${cmd}' by 'brew install ${pkg} && brew link --force ${pkg}'`)
        } else {
            throw new Error(`install '${cmd}' by 'brew install ${pkg}'`)
        }
    }
}

async function requirePipCmd (cmd, pkg) {
    try {
        await commandExists(cmd)
    } catch (err) {
        throw new Error(`install '${cmd}' by 'pip install ${pkg}'`)
    }
}

async function requirePipFromGitHubCmd (cmd, pkg, gitHubRepo) {
    try {
        await commandExists(cmd)
    } catch (err) {
        throw new Error(`install '${cmd}' by 'pip install git+https://github.com/${gitHubRepo}.git'`)
    }
}
