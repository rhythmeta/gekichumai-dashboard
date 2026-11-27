/** Best-effort clipboard copy; resolves `false` when the browser blocks it. */
export async function copyTextToClipboard(value: string): Promise<boolean> {
	try {
		if (typeof navigator === "undefined" || !navigator.clipboard) {
			return false;
		}
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		return false;
	}
}
