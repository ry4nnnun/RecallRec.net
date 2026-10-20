// Shared bits: where the Recall server lives, and the signed-in session.
//
// The pages talk to the Recall server directly from the browser, so it has to answer on
// HTTPS with a certificate the browser trusts — the server's own dev certificate is
// self-signed and would be refused before any request went out. It is published through a
// Cloudflare tunnel instead, and one hostname reaches every service: `/-/<service>/<path>`
// names the service in the path, which the server's router strips.
//
// A quick tunnel gets a new name each time it is restarted. When that happens, put the new
// one here and rebuild.

const API_BASE = 'https://roses-span-trainers-feet.trycloudflare.com'

const service = (name, path) => `${API_BASE}/-/${name}${path}`

const SESSION_KEY = 'recall.session'

const session = {
	read() {
		try {
			return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
		} catch {
			return null
		}
	},
	write(value) {
		try {
			localStorage.setItem(SESSION_KEY, JSON.stringify(value))
		} catch {}
	},
	clear() {
		try {
			localStorage.removeItem(SESSION_KEY)
		} catch {}
	},
}

/** POST username/password to the server's token endpoint. Throws with a readable reason. */
async function signIn(username, password) {
	let response
	try {
		response = await fetch(service('auth', '/connect/token'), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ grant_type: 'password', username, password, client_id: 'web' }),
		})
	} catch {
		throw new Error(
			'Could not reach the Recall server. It has to be online and served over HTTPS with a certificate your browser trusts.'
		)
	}
	const body = await response.json().catch(() => ({}))
	if (!response.ok) {
		// The server answers an unknown username with the same "account_id or username is
		// required" it gives a request that named nobody at all; both read as a bad login here.
		const reason = String(body.error_description || body.error || '')
		throw new Error(
			/required|invalid_grant|password/i.test(reason)
				? 'That username and password did not work.'
				: reason || 'Could not log in.'
		)
	}
	return { username, token: body.access_token, accountId: body.account_id ?? null }
}

/** Swaps the Log in / Download buttons for the signed-in player's name. */
function paintAccount() {
	const slot = document.querySelector('[data-account]')
	if (!slot) return
	const who = session.read()
	slot.replaceChildren()
	if (!who) {
		const login = document.createElement('a')
		login.className = 'pill ghost'
		login.href = 'login.html'
		login.textContent = 'Log in'
		const download = document.createElement('a')
		download.className = 'pill solid'
		download.href = 'download.html'
		download.textContent = 'Download'
		slot.append(login, download)
		return
	}
	const name = document.createElement('span')
	name.className = 'signed-in'
	name.textContent = who.username
	const out = document.createElement('button')
	out.className = 'pill ghost'
	out.type = 'button'
	out.textContent = 'Log out'
	out.addEventListener('click', () => {
		session.clear()
		location.reload()
	})
	const download = document.createElement('a')
	download.className = 'pill solid'
	download.href = 'download.html'
	download.textContent = 'Download'
	slot.append(name, out, download)
}

document.addEventListener('DOMContentLoaded', paintAccount)
