import { json } from '@sveltejs/kit';
import { getDaemonByLabel } from '$shared/daemons';
import { isScheduledPlist, printLabel, kickstart, bootout } from '$lib/launchctl';
import type { RequestHandler } from './$types';

type Action = 'start' | 'stop' | 'restart';

export const POST: RequestHandler = async ({ params, request }) => {
	if (process.env.ATLAS_DAEMON_WRITE !== '1') {
		return json({ error: 'writes disabled' }, { status: 403 });
	}
	const daemon = getDaemonByLabel(params.label!);
	if (!daemon) return json({ error: 'not found' }, { status: 404 });
	if (daemon.selfManaged) return json({ error: 'self-managed' }, { status: 403 });

	const { action } = (await request.json()) as { action: Action };
	if (action === 'stop') await bootout(daemon.label);
	else if (action === 'start' || action === 'restart') await kickstart(daemon.label);
	else return json({ error: 'invalid action' }, { status: 400 });

	const state = await printLabel(daemon.label, await isScheduledPlist(daemon.plist));
	return json({ action, state });
};
