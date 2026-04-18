declare module "whois" {
  export function lookup(
    domain: string,
    callback: (err: Error | null, data: string) => void
  ): void;
  const _default: { lookup: typeof lookup };
  export default _default;
}
