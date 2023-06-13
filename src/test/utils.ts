import {EntryCollection} from "../entry-collection.js";
import {type KeyEntry} from "../entry.js";

export function expectKeyEntry(keys: EntryCollection<KeyEntry>, context: string | null, key: string, isPlural: boolean, file?: string, loc?: string) {
    const keyEntry = keys.find(context, key)
    expect(keyEntry).not.toBeNull()
    expect(keyEntry!.isPlural).toEqual(isPlural)
    if (file != null && loc != null) {
        expect(keyEntry!.references).toContainEqual({file, loc})
    }
}
