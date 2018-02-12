import {spawn, exec} from 'child_process'
import commandExists from 'command-exists'
import path from 'path'

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

async function requireNpmCmd (cmd, pkg, needGlobal = false) {
    try {
        await commandExists(cmd)
    } catch (err) {
        if (needGlobal) {
            throw new Error(`install '${cmd}' by 'npm install -g ${pkg}'`)
        }

        try {
            await commandExists(await getNpmBinPath(cmd))
        } catch (err) {
            throw new Error(`install '${cmd}' by 'npm install --save-dev ${pkg}'`)
        }
    }
}

async function requireBrewCmd (cmd, pkg, needForceLink = false) {
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

let _npmBin = null
async function getNpmBinPath (cmd) {
    if (_npmBin == null) {
        _npmBin = await new Promise((resolve, reject) => {
            exec('npm bin', (error, stdout) => {
                if (error) {
                    reject(error)
                } else {
                    resolve(stdout.trim())
                }
            })
        })
    }
    return path.join(_npmBin, cmd)
}
