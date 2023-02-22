import {
    FormatNotFoundError,
    TagNotFoundError,
    TooManyFormatError,
    UnexpectedFormatError,
    UnexpectedTagError,
    validateMsg
} from './validator'

describe('validate message', () => {
    it('C string format', () => {
        expect(() => validateMsg('Hello %s', '안녕 %s')).not.toThrow()
        expect(() => validateMsg('Hello %s', '안녕')).toThrow(FormatNotFoundError)
        expect(() => validateMsg('Hello', '안녕 %s')).toThrow(UnexpectedFormatError)
        expect(() => validateMsg('Hello %s', '안녕 %d')).toThrow(FormatNotFoundError)
        expect(() => validateMsg('Hello %.2f', '안녕 %.1f')).toThrow(FormatNotFoundError)
        expect(() => validateMsg('Hello %s, %f', '안녕 %s, %f')).toThrow(TooManyFormatError)
    })

    it('ordered C string format', () => {
        expect(() => validateMsg('Hello %1$s', '안녕 %1$s')).not.toThrow()
        expect(() => validateMsg('Hello %1$s', '안녕')).toThrow(FormatNotFoundError)
        expect(() => validateMsg('Hello', '안녕 %1$s')).toThrow(UnexpectedFormatError)
        expect(() => validateMsg('Hello %1$s', '안녕 %1$d')).toThrow(FormatNotFoundError)
        expect(() => validateMsg('Hello %1$.2f', '안녕 %1$.1f')).toThrow(FormatNotFoundError)
        expect(() => validateMsg('Hello %1$s, %2$f', '안녕 %1$s, %2$f')).not.toThrow()
        expect(() => validateMsg('Hello %1$s, %2$f', '안녕 %2$f, %1$s')).not.toThrow()
        expect(() => validateMsg('Hello %1$s, %2$f', '안녕 %1$f, %2$s')).toThrow(FormatNotFoundError)
    })

    it('single brace named format', () => {
        expect(() => validateMsg('Hello {}', '안녕 {}')).not.toThrow()
        expect(() => validateMsg('Hello {0}', '안녕 {0}')).not.toThrow()
        expect(() => validateMsg('Hello {name}', '안녕 {name}')).not.toThrow()
        expect(() => validateMsg('Hello {name}', '안녕')).toThrow(FormatNotFoundError)
        expect(() => validateMsg('Hello', '안녕 {name}')).toThrow(UnexpectedFormatError)
        expect(() => validateMsg('Hello {name}', '안녕 {username}')).toThrow(FormatNotFoundError)
        expect(() => validateMsg('Hello {name}, {desc}', '안녕 {name}, {desc}')).not.toThrow()
        expect(() => validateMsg('Hello {name}, {desc}', '안녕 {desc}, {name}')).not.toThrow()
        expect(() => validateMsg('Hello {name}, {desc}', '안녕 {desc}, {name}, {name}')).not.toThrow()
        expect(() => validateMsg('Hello {name}, {desc}', '안녕 {name}, {name}')).toThrow(FormatNotFoundError)
    })

    it('markup', () => {
        expect(() => validateMsg('Hello <b>{}</b>', '안녕 <b>{}</b>')).not.toThrow()
        expect(() => validateMsg('Hello <div class="b">{0}</div>', '안녕 <div class="b">{0}</div>')).not.toThrow()
        expect(() => validateMsg('Hello <div class = "b" >{name}</div >', '안녕 <div class= "b" >{name}</div >')).not.toThrow()
        expect(() => validateMsg('Hello <heart/>', '안녕')).toThrow(TagNotFoundError)
        expect(() => validateMsg('Hello', '안녕 <heart />')).toThrow(UnexpectedTagError)
        expect(() => validateMsg('Hello <heart/>', '안녕 <heart />')).not.toThrow()
        expect(() => validateMsg('Hello <heart/>', '안녕 <hart/>')).toThrow(TagNotFoundError)
        expect(() => validateMsg('Hello <b>{name}, <i>{desc}</i></b>', '안녕 <b>{name}, <i>{desc}</i></b>')).not.toThrow()
        expect(() => validateMsg('Hello <b>{name}, <i>{desc}</i></b>', '안녕 <b><i>{desc}</i>, {name}</b>')).not.toThrow()
        expect(() => validateMsg('Hello <b>{name}, <i>{desc}</i></b>', '안녕 <b><i>{desc}</i>, {name}</b>, <b>{name}</b>')).toThrow(UnexpectedTagError)
        expect(() => validateMsg('Hello <b>{name}, <i>{desc}</i></b>', '안녕 <b>{name}</b>, <b>{desc}</b>')).toThrow(TagNotFoundError)
        expect(() => validateMsg('Hello <b>{name}, <br><i>{desc}</i></b>', '안녕 <b>{name}, <br><i>{desc}</i></b>')).not.toThrow()
        expect(() => validateMsg('Hello <b>{name}, <i>{desc}</i></b>', '안녕 <b>{name}, <br><i>{desc}</i></b>')).toThrow(UnexpectedTagError)
        expect(() => validateMsg('Hello <b>{name}, <br><i>{desc}</i></b>', '안녕 <b>{name}, <i>{desc}</i></b>')).not.toThrow()
        expect(() => validateMsg('Hello <b>{name}, <br><i>{desc}</i></b>', '안녕 <b>{name}, <i>{desc}</i></b>')).not.toThrow()
        expect(() => validateMsg('Hello <b>{name}, <br><i>{desc}</i></b>', '안녕 <b>{name}, <br><i>{desc}</i><br></b>')).not.toThrow()
    })
})
