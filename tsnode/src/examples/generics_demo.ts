/**
 * TypeScript Advanced Generics
 * =============================
 *
 * TypeScript's type system is Turing-complete — types can compute new types.
 * These examples go from basic generics to conditional types that transform
 * other types at compile time.
 *
 * Run: npx tsx src/examples/generics_demo.ts
 *
 * Topics:
 *   1. Basic generics & constraints
 *   2. Conditional types: T extends U ? X : Y
 *   3. infer keyword: extract a type from within another type
 *   4. Mapped types: transform every property of an object type
 *   5. Template literal types: string manipulation at the type level
 *   6. Recursive types: types that reference themselves
 *   7. Utility types built from scratch (Partial, Required, Pick, Omit, ReturnType)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Basic Generics & Constraints
// ─────────────────────────────────────────────────────────────────────────────
// Generic functions work on any type — like a template in C++.
// Constraints (extends) narrow what types are accepted.

function identity<T>(value: T): T {
  return value; // T flows through unchanged
}

// Constraint: T must have a .length property
function longest<T extends { length: number }>(a: T, b: T): T {
  return a.length >= b.length ? a : b;
}

// Multiple type parameters: map A→B over an array
function mapArray<A, B>(arr: A[], fn: (item: A) => B): B[] {
  return arr.map(fn);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Result<T, E> — A Type-Safe Alternative to throw/catch
// ─────────────────────────────────────────────────────────────────────────────
// Instead of throwing exceptions (which are invisible in types), return a Result.
// The caller is FORCED by the type system to handle both success and failure.
// This pattern is idiomatic in Rust and F# — we bring it to TypeScript.

type Ok<T>  = { readonly ok: true;  readonly value: T };
type Err<E> = { readonly ok: false; readonly error: E };
type Result<T, E = Error> = Ok<T> | Err<E>;

// Constructor helpers
const ok  = <T>(value: T): Ok<T>   => ({ ok: true,  value });
const err = <E>(error: E): Err<E>  => ({ ok: false, error });

// Chain Results without nested if/else
function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

function flatMap<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

// Example usage
function parseAge(input: string): Result<number, string> {
  const n = parseInt(input);
  if (isNaN(n)) return err(`"${input}" is not a valid number`);
  if (n < 0 || n > 150) return err(`Age ${n} is out of range`);
  return ok(n);
}

const ageResult = parseAge("25");
if (ageResult.ok) {
  console.log("Valid age:", ageResult.value); // TypeScript knows .value exists here
} else {
  console.log("Error:", ageResult.error);     // TypeScript knows .error exists here
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Conditional Types: T extends U ? X : Y
// ─────────────────────────────────────────────────────────────────────────────
// Conditional types compute new types based on whether T is assignable to U.
// They enable type-level decision making.

// IsArray<T>: true if T is an array, false otherwise
type IsArray<T> = T extends unknown[] ? true : false;

type _Test1 = IsArray<string[]>;   // true
type _Test2 = IsArray<string>;     // false

// Unwrap<T>: if T is a Promise, extract its resolved type
type Unwrap<T> = T extends Promise<infer U> ? U : T;

type _Test3 = Unwrap<Promise<string>>;  // string
type _Test4 = Unwrap<number>;           // number

// ─────────────────────────────────────────────────────────────────────────────
// 4. infer — Extract Types from Within Other Types
// ─────────────────────────────────────────────────────────────────────────────
// `infer` introduces a type variable within a conditional type.
// It "captures" part of a type so you can use it on the right side.

// Extract the return type of a function (like built-in ReturnType<T>)
type MyReturnType<T> = T extends (...args: unknown[]) => infer R ? R : never;

type _Test5 = MyReturnType<() => string>;                    // string
type _Test6 = MyReturnType<(x: number) => Promise<boolean>>; // Promise<boolean>

// Extract the element type of an array
type ElementType<T> = T extends (infer E)[] ? E : never;

type _Test7 = ElementType<string[]>;  // string
type _Test8 = ElementType<[1, 2, 3]>; // 1 | 2 | 3

// Extract first argument of a function
type FirstArg<T> = T extends (first: infer F, ...rest: unknown[]) => unknown ? F : never;

type _Test9 = FirstArg<(x: string, y: number) => void>; // string

// ─────────────────────────────────────────────────────────────────────────────
// 5. Mapped Types — Transform Every Property
// ─────────────────────────────────────────────────────────────────────────────
// Mapped types iterate over every key of an object type and transform them.
// Syntax: { [K in keyof T]: ... }

type MyPartial<T>   = { [K in keyof T]?: T[K] };        // All optional
type MyRequired<T>  = { [K in keyof T]-?: T[K] };       // Remove optional (-?)
type MyReadonly<T>  = { readonly [K in keyof T]: T[K] }; // All readonly
type MyPick<T, K extends keyof T>   = { [P in K]: T[P] };
type MyOmit<T, K extends keyof T>   = { [P in Exclude<keyof T, K>]: T[P] };
type MyRecord<K extends string, V>  = { [P in K]: V };

// Nullable: make every value nullable
type Nullable<T> = { [K in keyof T]: T[K] | null };

// Transformer: apply a function type to every property's value type
type Getters<T> = { [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] };

interface User { id: string; name: string; email: string; }
type UserGetters = Getters<User>;
// { getId: () => string; getName: () => string; getEmail: () => string; }

// ─────────────────────────────────────────────────────────────────────────────
// 6. Template Literal Types — String Manipulation at the Type Level
// ─────────────────────────────────────────────────────────────────────────────
// TypeScript can construct string literal types from other string literals.
// This enables strongly typed route definitions, event names, CSS properties, etc.

type EventName<T extends string> = `on${Capitalize<T>}`;

type _Test10 = EventName<"click">;  // "onClick"
type _Test11 = EventName<"submit">; // "onSubmit"

// Build API endpoint types from a route definition
type HttpMethod  = "get" | "post" | "put" | "delete";
type ApiEndpoint = `/${string}`;
type ApiRoute    = `${Uppercase<HttpMethod>} ${ApiEndpoint}`;

const route: ApiRoute = "GET /api/users"; // ✅
// const bad: ApiRoute = "PATCH /api"; // ❌ TypeScript error

// Combine with mapped types: generate event handler types
type EventHandlers<Events extends string> = {
  [E in Events as `on${Capitalize<E>}`]: () => void;
};
type ButtonEvents = EventHandlers<"click" | "hover" | "focus">;
// { onClick: () => void; onHover: () => void; onFocus: () => void; }

// ─────────────────────────────────────────────────────────────────────────────
// 7. Recursive Types
// ─────────────────────────────────────────────────────────────────────────────

// DeepPartial: make every nested property optional
type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

// DeepReadonly: make every nested property readonly
type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

// JSON type: represents any valid JSON value
type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

// ─────────────────────────────────────────────────────────────────────────────
// 8. Typed EventEmitter — Putting it all together
// ─────────────────────────────────────────────────────────────────────────────
// A generic EventEmitter where event names and payload types are enforced.

type EventMap = Record<string, unknown>;

class TypedEmitter<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<(payload: unknown) => void>>();

  /**
   * Register a listener for an event.
   * TypeScript ensures the callback receives the correct payload type.
   */
  on<E extends keyof Events>(event: E, listener: (payload: Events[E]) => void): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener as (payload: unknown) => void);
    return this;
  }

  /**
   * Emit an event.
   * TypeScript enforces that you provide the correct payload type.
   */
  emit<E extends keyof Events>(event: E, payload: Events[E]): void {
    this.listeners.get(event)?.forEach(fn => fn(payload));
  }

  off<E extends keyof Events>(event: E, listener: (payload: Events[E]) => void): this {
    this.listeners.get(event)?.delete(listener as (payload: unknown) => void);
    return this;
  }
}

// Usage: event types are defined once, enforced everywhere
type PlaygroundEvents = {
  "user:created":  { username: string; email: string };
  "task:completed": { taskId: string; completedAt: string };
  "realm:joined":  { realmId: string; userId: string };
};

const emitter = new TypedEmitter<PlaygroundEvents>();

emitter.on("user:created", ({ username }) => {
  console.log(`New user: ${username}`);
});

emitter.emit("user:created", { username: "alice", email: "alice@example.com" });
// emitter.emit("user:created", { wrong: "field" }); // ← TypeScript error!

// ─────────────────────────────────────────────────────────────────────────────
// Compile-time assertions
// ─────────────────────────────────────────────────────────────────────────────
// Use these to verify type relationships at compile time (not runtime).
// If any assertion fails, the file won't compile — docs that stay correct.

type Assert<T extends true> = T;
type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

type _AssertUnwrap = Assert<Equals<Unwrap<Promise<string>>, string>>;
type _AssertIsArray = Assert<Equals<IsArray<number[]>, true>>;
type _AssertNotArray = Assert<Equals<IsArray<number>, false>>;

console.log("✅ All generic type examples compiled and ran successfully!");
