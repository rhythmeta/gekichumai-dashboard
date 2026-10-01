import type { RequestFn } from "@/App";
/** Existing table components paginate locally; collect every server page first. */
export async function fetchAllRows<T>(
  request: RequestFn,
  path: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 200) {
    const response = await request<{ rows: T[]; total?: number }>(
      `${path}${path.includes("?") ? "&" : "?"}limit=200&offset=${offset}`,
    );
    rows.push(...response.rows);
    if (
      response.rows.length < 200 ||
      (response.total !== undefined && rows.length >= response.total)
    )
      return rows;
  }
}
