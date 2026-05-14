import type { PluginContext, ConfigFieldDefinition } from './types.js';
import type { Config } from './config.js';

const schemaMap = new Map<Function, ConfigFieldDefinition[]>();

type LegacyFieldDecorator = (target: object, propertyKey: string | symbol) => void;
type StandardFieldDecorator = <T, V>(value: undefined, context: ClassFieldDecoratorContext<T, V>) => void;

export function ConfigField(def: Omit<ConfigFieldDefinition, 'propertyKey'>): LegacyFieldDecorator & StandardFieldDecorator {
    return function (targetOrValue: object | undefined, propertyKeyOrContext: string | symbol | ClassFieldDecoratorContext) {
        if (typeof propertyKeyOrContext === 'object') {
            const context = propertyKeyOrContext;
            context.addInitializer(function () {
                registerConfigField(this.constructor, String(context.name), def);
            });
            return;
        }

        registerConfigField((targetOrValue as object).constructor, String(propertyKeyOrContext), def);
    };
}

function registerConfigField(ctor: Function, propertyKey: string, def: Omit<ConfigFieldDefinition, 'propertyKey'>): void {
    const fields = schemaMap.get(ctor) || [];
    if (fields.some(field => field.propertyKey === propertyKey)) return;

    fields.push({ propertyKey, type: def.type, default: def.default, description: def.description, required: def.required });
    schemaMap.set(ctor, fields);
}

export function getConfigSchema(ctor: Function): ConfigFieldDefinition[] {
    return schemaMap.get(ctor) || [];
}

export abstract class BasePlugin {
    protected ctx!: PluginContext;
    config!: Record<string, any>;

    get bot() {
        return this.ctx.bot;
    }

    get db() {
        return this.ctx.db;
    }

    get adapterManager() {
        return this.ctx.adapterManager;
    }

    get botConfig(): Config {
        return this.ctx.botConfig;
    }

    get version(): string {
        return this.ctx.version;
    }

    abstract onLoad(ctx: PluginContext): Promise<void>;

    onUnload(): Promise<void> {
        return Promise.resolve();
    }
}
