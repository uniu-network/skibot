import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const getFrontendDir = (): string => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    return resolve(__dirname, 'frontend');
};

export function getFrontendHtml(): string {
    const dir = getFrontendDir();
    try {
        return readFileSync(resolve(dir, 'index.html'), 'utf8');
    } catch {
        return '<!DOCTYPE html><html><body><h1>Frontend files not found</h1></body></html>';
    }
}

export function getFrontendFile(filename: string): string | null {
    const dir = getFrontendDir();
    try {
        return readFileSync(resolve(dir, filename), 'utf8');
    } catch {
        return null;
    }
}

export function getFrontendFileBuffer(filename: string): Buffer | null {
    const dir = getFrontendDir();
    try {
        return readFileSync(resolve(dir, filename));
    } catch {
        return null;
    }
}
