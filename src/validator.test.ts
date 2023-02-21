import {
    FormatNotFoundError, NotEnoughFormatError,
    TooManyFormatError,
    UnexpectedFormatError,
    UnmatchedFormatError,
    validateMsgFormat
} from './validator'

describe('validate po message format', () => {
    it('C string format', () => {
        expect(() => validateMsgFormat('Hello %s', '안녕 %s')).not.toThrow()
        expect(() => validateMsgFormat('Hello %s', '안녕')).toThrow(FormatNotFoundError)
        expect(() => validateMsgFormat('Hello', '안녕 %s')).toThrow(UnexpectedFormatError)
        expect(() => validateMsgFormat('Hello %s', '안녕 %d')).toThrow(UnmatchedFormatError)
        expect(() => validateMsgFormat('Hello %.2f', '안녕 %.1f')).toThrow(UnmatchedFormatError)
        expect(() => validateMsgFormat('Hello %s, %f', '안녕 %s, %f')).toThrow(TooManyFormatError)
    })

    it('ordered C string format', () => {
        expect(() => validateMsgFormat('Hello %1$s', '안녕 %1$s')).not.toThrow()
        expect(() => validateMsgFormat('Hello %1$s', '안녕')).toThrow(FormatNotFoundError)
        expect(() => validateMsgFormat('Hello', '안녕 %1$s')).toThrow(UnexpectedFormatError)
        expect(() => validateMsgFormat('Hello %1$s', '안녕 %1$d')).toThrow(UnmatchedFormatError)
        expect(() => validateMsgFormat('Hello %1$.2f', '안녕 %1$.1f')).toThrow(UnmatchedFormatError)
        expect(() => validateMsgFormat('Hello %1$s, %2$f', '안녕 %1$s, %2$f')).not.toThrow()
        expect(() => validateMsgFormat('Hello %1$s, %2$f', '안녕 %2$f, %1$s')).not.toThrow()
        expect(() => validateMsgFormat('Hello %1$s, %2$f', '안녕 %1$f, %2$s')).toThrow(UnmatchedFormatError)
    })

    it('single bracket named format', () => {
        expect(() => validateMsgFormat('Hello {}', '안녕 {}')).not.toThrow()
        expect(() => validateMsgFormat('Hello {0}', '안녕 {0}')).not.toThrow()
        expect(() => validateMsgFormat('Hello {name}', '안녕 {name}')).not.toThrow()
        expect(() => validateMsgFormat('Hello {name}', '안녕')).toThrow(FormatNotFoundError)
        expect(() => validateMsgFormat('Hello', '안녕 {name}')).toThrow(UnexpectedFormatError)
        expect(() => validateMsgFormat('Hello {name}', '안녕 {username}')).toThrow(UnmatchedFormatError)
        expect(() => validateMsgFormat('Hello {name}, {desc}', '안녕 {name}, {desc}')).not.toThrow()
        expect(() => validateMsgFormat('Hello {name}, {desc}', '안녕 {desc}, {name}')).not.toThrow()
        expect(() => validateMsgFormat('Hello {name}, {desc}', '안녕 {desc}, {name}, {name}')).not.toThrow()
        expect(() => validateMsgFormat('Hello {name}, {desc}', '안녕 {name}, {name}')).toThrow(NotEnoughFormatError)
    })
})
