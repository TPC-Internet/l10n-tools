import objectPath from 'object-path'

export class Config {
    private readonly rc: any
    private readonly prefix: string
    constructor (rc: any, name?: string | string[]) {
        this.rc = rc
        if (name == null) {
            this.prefix = ''
        } else if (Array.isArray(name)) {
            this.prefix = name.join('.')
        } else {
            this.prefix = name
        }
    }

    getSubConfig (name: string | string[]) {
        const rc = objectPath.get(this.rc, name, null)
        if (rc == null) {
            return null
        }
        return new Config(rc, this.appendPrefix(name))
    }

    appendPrefix (name: string | string[]) {
        let prefix
        if (Array.isArray(name)) {
            prefix = name.join('.')
        } else {
            prefix = name
        }
        if (this.prefix) {
            prefix = this.prefix + '.' + prefix
        }
        return prefix
    }

    get<T> (name: string | string[], defaultValue?: T): T {
        const value = objectPath.get(this.rc, name, defaultValue)
        if (value === undefined) {
            throw new Error(`config '${this.appendPrefix(name)}' is required`)
        }
        return value
    }

    getLength () {
        if (!Array.isArray(this.rc)) {
            throw new Error(`config '${this.prefix}' is not array`)
        }
        return this.rc.length
    }
}
