import type { ConfigFieldDefinition } from './types.js';

export interface ValidationResult {
    valid: boolean;
    config: Record<string, any>;
    errors: string[];
}

export function validateConfig(raw: Record<string, any> | null, schema: ConfigFieldDefinition[]): ValidationResult {
    const config: Record<string, any> = {};
    const errors: string[] = [];

    for (const field of schema) {
        let value = (raw && field.propertyKey in raw) ? raw[field.propertyKey] : field.default;

        if (value === undefined || value === null) {
            if (field.required) {
                errors.push(`Config field "${field.propertyKey}" is required but missing`);
                continue;
            }
            value = field.default;
        }

        try {
            value = coerceType(value, field.type);
        } catch (e) {
            errors.push(`Config field "${field.propertyKey}": ${(e as Error).message}`);
            value = field.default;
        }

        config[field.propertyKey] = value;
    }

    return { valid: errors.length === 0, config, errors };
}

function coerceType(value: any, type: string): any {
    switch (type) {
        case 'boolean':
            if (typeof value === 'string') {
                if (value === 'true' || value === '1') return true;
                if (value === 'false' || value === '0') return false;
            }
            if (typeof value === 'number') return value !== 0;
            if (typeof value !== 'boolean') throw new Error(`expected boolean, got ${typeof value}`);
            return value;
        case 'number':
            if (typeof value === 'string') {
                const n = Number(value);
                if (isNaN(n)) throw new Error(`cannot convert "${value}" to number`);
                return n;
            }
            if (typeof value !== 'number') throw new Error(`expected number, got ${typeof value}`);
            return value;
        case 'string':
            if (typeof value !== 'string') return String(value);
            return value;
        case 'string[]':
            if (!Array.isArray(value)) throw new Error(`expected array, got ${typeof value}`);
            return value.map(v => (typeof v === 'string' ? v : String(v)));
        case 'object':
            if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                throw new Error(`expected object, got ${typeof value}`);
            }
            return value;
        default:
            return value;
    }
}
