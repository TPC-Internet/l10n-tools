declare module "i18n-strings-files" {
    export interface I18nStringsMsg {
        [msgid: string]: string
    }
    export interface CommentedI18nStringsMsg {
        [msgid: string]: {
            text: string
            comment?: string
        }
    }
    export function parse(input: string, wantsComments: true): CommentedI18nStringsMsg
    export function parse(input: string, wantsComments: false): I18nStringsMsg
    export function readFileSync(file: string, options?: {encoding?: BufferEncoding, wantsComments: true}): CommentedI18nStringsMsg
    export function readFileSync(file: string, options?: {encoding?: BufferEncoding, wantsComments?: false}): I18nStringsMsg
}
