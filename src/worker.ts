const BACKUP_ORIGIN = "https://backups.rhythmeta.org";
const DASHBOARD_ORIGIN = "https://dash.rhythmeta.org";

type AssetBinding = {
	fetch(request: Request): Promise<Response>;
};

type WorkerEnvironment = {
	ASSETS: AssetBinding;
};

function isBackupPath(pathname: string): boolean {
	return pathname.startsWith("/backups/") && pathname.length > "/backups/".length;
}

function corsHeaders(request: Request): Headers {
	const headers = new Headers();
	if (request.headers.get("Origin") === DASHBOARD_ORIGIN) {
		headers.set("Access-Control-Allow-Origin", DASHBOARD_ORIGIN);
		headers.set("Vary", "Origin");
	}
	return headers;
}

async function proxyBackup(request: Request): Promise<Response> {
	if (request.method === "OPTIONS") {
		const headers = corsHeaders(request);
		headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
		headers.set(
			"Access-Control-Allow-Headers",
			"Content-Type, Range, If-None-Match, If-Modified-Since",
		);
		return new Response(null, { status: 204, headers });
	}

	if (request.method !== "GET" && request.method !== "HEAD") {
		return new Response("Method Not Allowed", {
			status: 405,
			headers: { Allow: "GET, HEAD, OPTIONS" },
		});
	}

	const incomingUrl = new URL(request.url);
	const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, BACKUP_ORIGIN);
	const upstreamHeaders = new Headers(request.headers);
	upstreamHeaders.delete("Host");
	upstreamHeaders.delete("Origin");
	const upstream = await fetch(upstreamUrl, {
		method: request.method,
		headers: upstreamHeaders,
		redirect: "follow",
	});
	const headers = new Headers(upstream.headers);
	for (const [name, value] of corsHeaders(request)) {
		if (name === "Vary" && headers.has(name)) {
			headers.set(name, `${headers.get(name)}, ${value}`);
		} else {
			headers.set(name, value);
		}
	}

	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers,
	});
}

const worker = {
	async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
		const url = new URL(request.url);
		if (isBackupPath(url.pathname)) {
			return proxyBackup(request);
		}
		return env.ASSETS.fetch(request);
	},
};

export default worker;
