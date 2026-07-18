import { json } from '@sveltejs/kit';
import { stat } from 'node:fs/promises';
import { getDaemons, type DaemonDef } from '$shared/daemons';
import { isScheduledPlist, printLabel } from '$lib/launchctl';
import { checkPort } from '$lib/ports';
import type { RequestHandler } from './$types';

async function enrich(d: DaemonDef) {
	const scheduled = await isScheduledPlist(d.plist);
	const [state, portInUse, stale] = await Promise.all([
		printLabel(d.label, scheduled),
		d.port ? checkPort(d.port) : Promise.resolve<boolean | null>(null),
		d.project ? stat(d.project).then(() => false).catch(() => true) : false
	]);
	return { ...d, state, scheduled, portInUse, stale };
}

export const GET: RequestHandler = async () => {
	const daemons = await Promise.all(getDaemons().map(enrich));
	return json({ daemons });
};
