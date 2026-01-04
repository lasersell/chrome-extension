const LAMPORTS_PER_SOL = 1_000_000_000;

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function formatSol(value: number, decimals = 4): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.?0+$/, "");
}

export function formatCompact(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs < 1_000) {
    return `${sign}${Math.trunc(abs)}`;
  }
  if (abs < 1_000_000) {
    const scaled = abs / 1_000;
    const rounded = trimTrailingZeros(scaled.toFixed(2));
    return `${sign}${rounded}k`;
  }
  if (abs < 1_000_000_000) {
    const scaled = abs / 1_000_000;
    const rounded = trimTrailingZeros(scaled.toFixed(2));
    return `${sign}${rounded} mil`;
  }
  if (abs < 1_000_000_000_000) {
    const scaled = abs / 1_000_000_000;
    const rounded = trimTrailingZeros(scaled.toFixed(2));
    return `${sign}${rounded} bil`;
  }
  const scaled = abs / 1_000_000_000_000;
  const rounded = trimTrailingZeros(scaled.toFixed(2));
  return `${sign}${rounded} tril`;
}

export function shortPubkey(value: string, prefix = 4, suffix = 4): string {
  if (!value) {
    return "--";
  }
  if (value.length <= prefix + suffix) {
    return value;
  }
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) {
    return "--";
  }
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) {
    return "--";
  }
  const diffSeconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}h`;
}
