// tsnode/src/examples/decorators_demo.ts
// =========================================
// TypeScript Decorators — metadata-driven programming
//
// Decorators are functions that wrap classes, methods, properties, or
// parameters to add behavior without modifying the original code.
// This is the foundation of frameworks like NestJS, Angular, TypeORM.
//
// Enable in tsconfig.json:
//   "experimentalDecorators": true
//   "emitDecoratorMetadata": true
//
// Run: npx tsx src/examples/decorators_demo.ts

import "reflect-metadata"; // Required for emitDecoratorMetadata

// ── 1. Class Decorators ────────────────────────────────────────────────────────
// A class decorator receives the constructor function.
// Return a new class to replace/extend the original.

// Simple metadata stamp
function Injectable(target: Function): void {
  Reflect.defineMetadata("injectable", true, target);
  console.log(`[Injectable] ${target.name} registered`);
}

// Add timestamp metadata
function Timestamp(target: Function): void {
  Reflect.defineMetadata("createdAt", new Date().toISOString(), target);
}

// Singleton pattern via class decorator
function Singleton<T extends { new (...args: any[]): object }>(Base: T): T {
  let instance: InstanceType<T> | null = null;

  return class extends Base {
    constructor(...args: any[]) {
      if (instance) return instance as any;
      super(...args);
      instance = this as any;
    }
  } as T;
}

@Singleton
@Injectable
@Timestamp
class DatabaseConnection {
  readonly id = Math.random().toString(36).slice(2);

  connect(dsn: string): void {
    console.log(`[DB ${this.id}] Connecting to ${dsn}`);
  }
}

const db1 = new DatabaseConnection();
const db2 = new DatabaseConnection();
console.log("\n── Singleton Decorator ──");
console.log("Same instance?", db1 === db2); // true
console.log("Injectable?", Reflect.getMetadata("injectable", DatabaseConnection));
console.log("Created at:", Reflect.getMetadata("createdAt", DatabaseConnection));

// ── 2. Method Decorators ───────────────────────────────────────────────────────
// Arguments: target (prototype), propertyKey (method name), descriptor (PropertyDescriptor)
// Modify descriptor.value to wrap the method.

// Automatic retry with exponential backoff
function Retry(times: number, delayMs = 100) {
  return function (
    _target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = async function (...args: unknown[]): Promise<unknown> {
      let lastErr: unknown;
      for (let attempt = 1; attempt <= times; attempt++) {
        try {
          return await original.apply(this, args);
        } catch (err) {
          lastErr = err;
          if (attempt === times) break;
          const delay = delayMs * 2 ** (attempt - 1); // exponential backoff
          console.log(`[Retry] ${propertyKey} attempt ${attempt} failed — retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
      throw lastErr;
    };

    return descriptor;
  };
}

// Performance timing
function Timed(
  _target: object,
  propertyKey: string,
  descriptor: PropertyDescriptor
): PropertyDescriptor {
  const original = descriptor.value as (...args: unknown[]) => unknown;

  descriptor.value = function (...args: unknown[]): unknown {
    const start = performance.now();
    const result = original.apply(this, args);

    if (result instanceof Promise) {
      return result.finally(() => {
        console.log(`[Timed] ${propertyKey}: ${(performance.now() - start).toFixed(2)}ms`);
      });
    }

    console.log(`[Timed] ${propertyKey}: ${(performance.now() - start).toFixed(2)}ms`);
    return result;
  };

  return descriptor;
}

// Method-level logging
function Log(
  _target: object,
  propertyKey: string,
  descriptor: PropertyDescriptor
): PropertyDescriptor {
  const original = descriptor.value as (...args: unknown[]) => unknown;

  descriptor.value = function (...args: unknown[]): unknown {
    console.log(`[Log] ${propertyKey}(${JSON.stringify(args)})`);
    const result = original.apply(this, args);
    console.log(`[Log] ${propertyKey} →`, result);
    return result;
  };

  return descriptor;
}

class MathService {
  @Timed
  @Log
  factorial(n: number): number {
    if (n <= 1) return 1;
    return n * this.factorial(n - 1);
  }

  @Retry(3, 50)
  @Timed
  async fetchData(url: string): Promise<string> {
    // Simulate flaky network
    if (Math.random() < 0.6) throw new Error("Network error");
    return `Data from ${url}`;
  }
}

console.log("\n── Method Decorators ──");
const math = new MathService();
math.factorial(6);

(async () => {
  try {
    const data = await math.fetchData("https://api.example.com/data");
    console.log("Got:", data);
  } catch {
    console.log("All retries exhausted");
  }

  // ── 3. Property Decorators ─────────────────────────────────────────────────
  // Arguments: target (prototype), propertyKey
  // Use Reflect.metadata to annotate; often combined with getter/setter tricks.

  function Required(target: object, propertyKey: string): void {
    const existing: string[] = Reflect.getMetadata("required", target) ?? [];
    Reflect.defineMetadata("required", [...existing, propertyKey], target);
  }

  function MinLength(min: number) {
    return function (target: object, propertyKey: string): void {
      Reflect.defineMetadata(`minLength:${propertyKey}`, min, target);
    };
  }

  // Validate object against decorators at runtime
  function validate(obj: object): string[] {
    const errors: string[] = [];
    const required: string[] = Reflect.getMetadata("required", Object.getPrototypeOf(obj)) ?? [];

    for (const key of required) {
      const value = (obj as Record<string, unknown>)[key];
      if (value === undefined || value === null || value === "") {
        errors.push(`${key} is required`);
      }
    }

    for (const key of Object.keys(obj)) {
      const min = Reflect.getMetadata(`minLength:${key}`, Object.getPrototypeOf(obj)) as number | undefined;
      const value = (obj as Record<string, unknown>)[key];
      if (min !== undefined && typeof value === "string" && value.length < min) {
        errors.push(`${key} must be at least ${min} characters`);
      }
    }

    return errors;
  }

  class CreateUserDto {
    @Required
    @MinLength(3)
    username!: string;

    @Required
    @MinLength(5)
    email!: string;

    role?: string;
  }

  console.log("\n── Property Decorators ──");
  const valid = Object.assign(new CreateUserDto(), { username: "alice", email: "alice@example.com" });
  console.log("Valid DTO errors:", validate(valid)); // []

  const invalid = Object.assign(new CreateUserDto(), { username: "al", email: "" });
  console.log("Invalid DTO errors:", validate(invalid)); // 2 errors

  // ── 4. Parameter Decorators ────────────────────────────────────────────────
  // Arguments: target (prototype), methodName, parameterIndex
  // Used by DI containers (NestJS/Angular) to record which params need injection.

  const PARAM_TYPES_KEY = "design:paramtypes";

  function Inject(token: string) {
    return function (
      target: object,
      propertyKey: string | symbol | undefined,
      parameterIndex: number
    ): void {
      const existing: Map<number, string> =
        Reflect.getMetadata("inject", target, propertyKey as string) ?? new Map();
      existing.set(parameterIndex, token);
      Reflect.defineMetadata("inject", existing, target, propertyKey as string);
    };
  }

  class ApiController {
    getData(
      @Inject("HTTP_CLIENT") client: object,
      @Inject("LOGGER") logger: object
    ): string {
      void client;
      void logger;
      return "data";
    }
  }

  const ctrl = new ApiController();
  const injectMap: Map<number, string> = Reflect.getMetadata("inject", ctrl, "getData") ?? new Map();
  console.log("\n── Parameter Decorators ──");
  console.log("Injected params:", Object.fromEntries(injectMap)); // { '0': 'HTTP_CLIENT', '1': 'LOGGER' }

  // ── 5. Decorator Factories & Composition ──────────────────────────────────
  // Decorators compose bottom-up: the decorator closest to the declaration runs first.
  // @A @B @C fn → applied as A(B(C(fn)))

  function Uppercase(
    _target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => string;
    descriptor.value = function (...args: unknown[]): string {
      return original.apply(this, args).toUpperCase();
    };
    return descriptor;
  }

  function Trim(
    _target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => string;
    descriptor.value = function (...args: unknown[]): string {
      return original.apply(this, args).trim();
    };
    return descriptor;
  }

  class StringService {
    // Decorators apply bottom-up: Trim runs first, then Uppercase
    @Uppercase
    @Trim
    process(input: string): string {
      return input;
    }
  }

  console.log("\n── Decorator Composition ──");
  const svc = new StringService();
  console.log(svc.process("  hello world  ")); // "HELLO WORLD"

  // ── 6. Real-World: NestJS-style Route Registration ────────────────────────
  // This pattern shows HOW frameworks like NestJS use decorators internally.

  interface RouteDefinition {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    handlerName: string;
  }

  function Controller(basePath: string) {
    return function (target: Function): void {
      Reflect.defineMetadata("basePath", basePath, target);
    };
  }

  function Route(method: RouteDefinition["method"], path: string) {
    return function (_target: object, propertyKey: string, _descriptor: PropertyDescriptor): void {
      const existing: RouteDefinition[] = Reflect.getMetadata("routes", _target) ?? [];
      Reflect.defineMetadata("routes", [...existing, { method, path, handlerName: propertyKey }], _target);
    };
  }

  const Get = (path: string) => Route("GET", path);
  const Post = (path: string) => Route("POST", path);

  @Controller("/users")
  class UserController {
    @Get("/")
    list() { return []; }

    @Get("/:id")
    getById() { return {}; }

    @Post("/")
    create() { return {}; }
  }

  const basePath = Reflect.getMetadata("basePath", UserController);
  const routes: RouteDefinition[] = Reflect.getMetadata("routes", UserController.prototype) ?? [];

  console.log("\n── NestJS-style Route Registration ──");
  console.log(`Controller base: ${basePath}`);
  for (const route of routes) {
    console.log(`  ${route.method} ${basePath}${route.path} → ${route.handlerName}()`);
  }
})();
