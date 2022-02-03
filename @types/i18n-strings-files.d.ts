declare module "i18n-strings-files" {
    export interface I18nStringsMsg {
        [msgid: string]: string
    }
    export interface CommentedI18nStringsMsg {
        [msgid: string]: {
            text: string
            comment: string
        }
    }
    export function parse<T = boolean>(input: string, wantsComments: boolean): I18nStringsMsg | CommentedI18nStringsMsg
}
