export interface ParsedArgs {
    _: string[];
    [key: string]: string | boolean | string[];
}

export function parseArgs(raw: string[]): ParsedArgs {
    const result: ParsedArgs = { _: [] };
    let i = 0;

    while (i < raw.length) {
        const token = raw[i];

        if (token.startsWith('--') && token.length > 2) {
            i += parseLongFlag(token, raw, i, result);
        } else if (token.startsWith('-') && token.length > 1 && !/^-\d/.test(token)) {
            i += parseShortFlag(token, raw, i, result);
        } else {
            result._.push(token);
            i++;
        }
    }

    return result;
}

function parseLongFlag(token: string, raw: string[], idx: number, result: ParsedArgs): number {
    const eqIdx = token.indexOf('=');
    if (eqIdx > 2) {
        const key = normalizeKey(token.slice(2, eqIdx));
        const value = token.slice(eqIdx + 1);
        result[key] = value;
        return 1;
    }

    const rawKey = token.slice(2);

    if (rawKey.startsWith('no-') && rawKey.length > 3) {
        result[normalizeKey(rawKey.slice(3))] = false;
        return 1;
    }

    const key = normalizeKey(rawKey);
    const next = raw[idx + 1];
    if (next !== undefined && !next.startsWith('-')) {
        result[key] = next;
        return 2;
    }

    result[key] = true;
    return 1;
}

function parseShortFlag(token: string, raw: string[], idx: number, result: ParsedArgs): number {
    const flags = token.slice(1);

    if (flags.length === 1) {
        const next = raw[idx + 1];
        if (next !== undefined && !next.startsWith('-')) {
            result[flags] = next;
            return 2;
        }
    }

    for (const ch of flags) {
        result[ch] = true;
    }
    return 1;
}

function normalizeKey(key: string): string {
    return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
