import {spawn} from 'child_process'
import commandExists from 'command-exists'
import log from 'npmlog'
import os from 'os'
import * as path from 'path'

export function execWithLog (cmd: string, logPrefix: string = ''): Promise<number> {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, [], {shell: true})

        p.stdout.on('data', data => {
            for (const line of data.toString().split('\n')) {
                if (line) {
                    log.info(logPrefix, line)
                }
            }
        })

        p.stderr.on('data', data => {
            for (const line of data.toString().split('\n')) {
                if (line) {
                    log.warn(logPrefix, line)
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

export const requireCmd = {
    brew: requireBrewCmd
}

async function requireBrewCmd (cmd: string, pkg: string, needForceLink: boolean = false): Promise<void> {
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

export function getTempDir(): string {
    return path.join(os.tmpdir(), process.pid.toString())
}

export function sortSet<T> (set: Set<T>): T[] {
    return Array.from(set).sort()
}
