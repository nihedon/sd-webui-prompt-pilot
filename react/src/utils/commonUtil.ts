export function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
    let debounceTimeout: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            func(...args);
        }, wait);
    };
}

export function debounceWithLeadingTrailing<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let lastCallTime: number | null = null;
    let lastArgs: Parameters<T> | null = null;
    let hasPendingTrailing = false;

    return (...args: Parameters<T>) => {
        const now = Date.now();

        if (!lastCallTime || now - lastCallTime >= wait) {
            func(...args);
            hasPendingTrailing = false;
        } else {
            hasPendingTrailing = true;
            lastArgs = args;
        }
        lastCallTime = now;

        if (timeout) clearTimeout(timeout);

        timeout = setTimeout(() => {
            if (hasPendingTrailing && lastArgs) {
                func(...lastArgs);
            }
            lastCallTime = null;
            hasPendingTrailing = false;
        }, wait);
    };
}

export function formatNumberWithUnits(num: number): string {
    if (Math.abs(num) >= 1e12) {
        return (num / 1e12).toFixed(1) + 'T';
    } else if (Math.abs(num) >= 1e9) {
        return (num / 1e9).toFixed(1) + 'G';
    } else if (Math.abs(num) >= 1e6) {
        return (num / 1e6).toFixed(1) + 'M';
    } else if (Math.abs(num) >= 1e3) {
        return (num / 1e3).toFixed(1) + 'K';
    } else {
        return num.toString();
    }
}
