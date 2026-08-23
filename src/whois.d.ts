declare module "whois" {
  export function lookup(
    domain: string,
    options: { timeout?: number },
    callback: (err: Error | null, data: string) => void
  ): void;
}
