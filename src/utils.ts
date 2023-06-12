import {spawn} from 'child_process'
import commandExists from 'command-exists'
import log from 'npmlog'
import os from 'node:os'
import fs from 'node:fs/promises'
import path from 'path'
import {glob} from 'glob'

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

export async function fileExists(filePath: string, readOnly: boolean): Promise<boolean> {
    try {
        await fs.access(filePath, readOnly ? fs.constants.R_OK : fs.constants.W_OK)
        return true
    } catch (err) {
        return false
    }
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

export function sortSet<T> (set: Set<T>, compareFn?: (a: T, b: T) => number): T[] {
    return Array.from(set).sort(compareFn)
}

export function addToArraySet<T>(array: T[], value: T): T[] {
    const set = new Set(array)
    set.add(value)
    return [...set]
}

export function removeFromArraySet<T>(array: T[], value: T): T[] {
    const set = new Set(array)
    set.delete(value)
    return [...set]
}

export async function listTransPaths(transDir: string): Promise<string[]> {
    return await glob(`${transDir}/trans-*.json`)
}

export function extractLocaleFromTransPath(transPath: string): string {
    return path.basename(transPath, '.json').substring(6)
}

export function getKeysPath(keysDir: string): string {
    return path.join(keysDir, 'keys.json')
}

export function getTransPath(transDir: string, locale: string): string {
    return path.join(transDir, `trans-${locale}.json`)
}
