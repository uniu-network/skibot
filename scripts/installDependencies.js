import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function main() {
    if (!fs.existsSync('./plugins')) return;

    const files = fs.readdirSync('./plugins');
    for (const file of files) {
        const pkgPath = path.join('./plugins', file, 'package.json');
        if (!fs.existsSync(pkgPath)) continue;

        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (!pkg.dependencies || Object.keys(pkg.dependencies).length === 0) continue;

        const pluginDir = path.resolve('./plugins', file);
        console.log(`Installing dependencies for plugin ${file}...`);
        try {
            execSync('npm install', { cwd: pluginDir, stdio: 'inherit' });
            console.log(`Plugin ${file} dependencies installed`);
        } catch (error) {
            console.error(`Failed to install dependencies for plugin ${file}: ${error.message}`);
            process.exit(1);
        }
    }
}

main();
