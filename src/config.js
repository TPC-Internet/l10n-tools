import objectPath from 'object-path'

export class Config {
    constructor (rc, path = null) {
        this.rc = rc
        if (path == null) {
            this.prefix = ''
        } else if (Array.isArray(path)) {
            this.prefix = path.join('.')
        } else {
            this.prefix = path
        }
    }

    getSubConfig (path) {
        const rc = objectPath.get(this.rc, path, null)
        if (rc == null) {
            return null
        }
        return new Config(rc, this.appendPrefix(path))
    }

    appendPrefix (path) {
        let prefix
        if (Array.isArray(path)) {
            prefix = path.join('.')
        } else {
            prefix = path
        }
        if (this.prefix) {
            prefix = this.prefix + '.' + prefix
        }
        return prefix
    }

    get (path, defaultValue = undefined) {
        const value = objectPath.get(this.rc, path, defaultValue)
        if (value === undefined) {
            throw new Error(`config '${this.appendPrefix(path)}' is required`)
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
