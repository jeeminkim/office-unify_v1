declare module 'vitest' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void): void;
  export function expect<T = unknown>(value: T): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toBeTruthy(): void;
    startsWith(expected: string): boolean;
    not: {
      toContain(expected: unknown): void;
    };
  };
}

